from collections import defaultdict
from datetime import datetime
from io import BytesIO

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import func
from sqlalchemy.orm import Session

from .auth import ALGORITHM, SECRET_KEY, create_access_token, hash_password, verify_password
from .database import Base, Budget, Comment, Group, GroupMember, Reminder, SessionLocal, Transaction, User, engine, get_db
from .schemas import (
    AddMemberRequest,
    BudgetRequest,
    CommentRequest,
    GroupCreate,
    LoginRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    ReminderRequest,
    TokenResponse,
    TransactionCreate,
    TransactionUpdate,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SpendMate API", version="0.1.0")
security = HTTPBearer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.post("/auth/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(status_code=400, detail="Email already used")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        phone=payload.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id, user.email))


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.id, user.email))


@app.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "two_factor_enabled": current_user.two_factor_enabled,
    }


@app.put("/me")
def update_me(payload: ProfileUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    data = payload.model_dump(exclude_none=True)
    for key, value in data.items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "two_factor_enabled": current_user.two_factor_enabled,
    }


@app.post("/transactions")
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = Transaction(
        user_id=current_user.id,
        category=payload.category,
        kind=payload.kind,
        amount=payload.amount,
        note=payload.note,
        group_id=payload.group_id,
        occurred_at=payload.occurred_at or datetime.utcnow(),
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@app.get("/transactions")
def list_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    group_id: int | None = Query(default=None),
    kind: str | None = Query(default=None),
):
    q = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if group_id:
        q = q.filter(Transaction.group_id == group_id)
    if kind:
        q = q.filter(Transaction.kind == kind)
    return q.order_by(Transaction.occurred_at.desc()).all()


@app.put("/transactions/{tx_id}")
def update_transaction(tx_id: int, payload: TransactionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(tx, field, value)
    db.commit()
    db.refresh(tx)
    return tx


@app.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    return {"deleted": True}


@app.post("/groups")
def create_group(payload: GroupCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = Group(name=payload.name, created_by=current_user.id)
    db.add(group)
    db.commit()
    db.refresh(group)
    db.add(GroupMember(group_id=group.id, user_id=current_user.id, role="admin"))
    db.commit()
    return group


@app.get("/groups")
def list_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(Group, GroupMember.role)
        .join(GroupMember, Group.id == GroupMember.group_id)
        .filter(GroupMember.user_id == current_user.id)
        .all()
    )
    return [{"id": g.id, "name": g.name, "role": role} for g, role in rows]


@app.post("/groups/{group_id}/members")
def add_member(group_id: int, payload: AddMemberRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    requester = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == current_user.id,
        GroupMember.role == "admin",
    ).first()
    if not requester:
        raise HTTPException(status_code=403, detail="Only admin can add member")

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    exists = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == user.id).first()
    if exists:
        raise HTTPException(status_code=400, detail="User already in group")

    m = GroupMember(group_id=group_id, user_id=user.id, role=payload.role)
    db.add(m)
    db.commit()
    return {"added": True}


@app.get("/groups/{group_id}/members")
def list_group_members(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not in this group")
    rows = (
        db.query(User.full_name, User.email, GroupMember.role)
        .join(GroupMember, User.id == GroupMember.user_id)
        .filter(GroupMember.group_id == group_id)
        .all()
    )
    return [{"full_name": full_name, "email": email, "role": role} for full_name, email, role in rows]


@app.post("/transactions/{tx_id}/comments")
def add_comment(tx_id: int, payload: CommentRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    comment = Comment(transaction_id=tx_id, user_id=current_user.id, content=payload.content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@app.get("/transactions/{tx_id}/comments")
def list_comments(tx_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ = current_user
    rows = db.query(Comment, User.full_name).join(User, Comment.user_id == User.id).filter(Comment.transaction_id == tx_id).all()
    return [{"id": c.id, "content": c.content, "author": name, "created_at": c.created_at} for c, name in rows]


@app.post("/budget")
def set_budget(payload: BudgetRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    budget = db.query(Budget).filter(Budget.user_id == current_user.id).first()
    if not budget:
        budget = Budget(user_id=current_user.id, monthly_limit=payload.monthly_limit, alert_enabled=payload.alert_enabled)
        db.add(budget)
    else:
        budget.monthly_limit = payload.monthly_limit
        budget.alert_enabled = payload.alert_enabled
    db.commit()
    return {"saved": True}


@app.get("/budget")
def get_budget(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    budget = db.query(Budget).filter(Budget.user_id == current_user.id).first()
    if not budget:
        return {"monthly_limit": 0, "alert_enabled": False}

    now = datetime.utcnow()
    spent = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0.0))
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.kind == "expense",
            func.strftime("%Y", Transaction.occurred_at) == str(now.year),
            func.strftime("%m", Transaction.occurred_at) == f"{now.month:02d}",
        )
        .scalar()
    )
    return {
        "monthly_limit": budget.monthly_limit,
        "alert_enabled": budget.alert_enabled,
        "spent_this_month": spent,
        "over_budget": budget.alert_enabled and spent > budget.monthly_limit,
    }


@app.post("/reminders")
def create_reminder(payload: ReminderRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reminder = Reminder(user_id=current_user.id, **payload.model_dump())
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


@app.get("/reminders")
def list_reminders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Reminder).filter(Reminder.user_id == current_user.id).all()


@app.get("/stats/summary")
def stats_summary(
    period: str = Query(default="month", pattern="^(day|week|month|year)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    q = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if period == "day":
        q = q.filter(
            func.strftime("%Y", Transaction.occurred_at) == str(now.year),
            func.strftime("%m", Transaction.occurred_at) == f"{now.month:02d}",
            func.strftime("%d", Transaction.occurred_at) == f"{now.day:02d}",
        )
    elif period == "week":
        q = q.filter(
            func.strftime("%Y", Transaction.occurred_at) == str(now.year),
            func.strftime("%W", Transaction.occurred_at) == now.strftime("%W"),
        )
    elif period == "month":
        q = q.filter(
            func.strftime("%Y", Transaction.occurred_at) == str(now.year),
            func.strftime("%m", Transaction.occurred_at) == f"{now.month:02d}",
        )
    else:
        q = q.filter(func.strftime("%Y", Transaction.occurred_at) == str(now.year))

    items = q.all()
    income = sum(x.amount for x in items if x.kind == "income")
    expense = sum(x.amount for x in items if x.kind == "expense")
    by_category = defaultdict(float)
    for item in items:
        if item.kind == "expense":
            by_category[item.category] += item.amount

    return {
        "period": period,
        "income": income,
        "expense": expense,
        "balance": income - expense,
        "by_category": dict(by_category),
    }


@app.get("/reports/export")
def export_report(
    fmt: str = Query(default="excel", pattern="^(excel|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .order_by(Transaction.occurred_at.desc())
        .all()
    )

    if fmt == "excel":
        wb = Workbook()
        ws = wb.active
        ws.title = "Transactions"
        ws.append(["Date", "Type", "Category", "Amount", "Note", "Group ID"])
        for r in rows:
            ws.append([
                r.occurred_at.strftime("%Y-%m-%d %H:%M"),
                r.kind,
                r.category,
                r.amount,
                r.note or "",
                r.group_id or "",
            ])

        output = BytesIO()
        wb.save(output)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=spendmate_report.xlsx"},
        )

    output = BytesIO()
    p = canvas.Canvas(output, pagesize=A4)
    p.setTitle("SpendMate Report")
    y = 800
    p.drawString(40, y, "SpendMate Expense Report")
    y -= 24
    for r in rows[:40]:
        text = f"{r.occurred_at:%Y-%m-%d} | {r.kind} | {r.category} | {r.amount:.2f}"
        p.drawString(40, y, text)
        y -= 16
        if y < 40:
            p.showPage()
            y = 800
    p.save()
    output.seek(0)
    return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=spendmate_report.pdf"})
