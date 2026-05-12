from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TransactionCreate(BaseModel):
    category: str
    kind: str
    amount: float
    note: Optional[str] = None
    occurred_at: Optional[datetime] = None
    group_id: Optional[int] = None


class TransactionUpdate(BaseModel):
    category: Optional[str] = None
    kind: Optional[str] = None
    amount: Optional[float] = None
    note: Optional[str] = None


class GroupCreate(BaseModel):
    name: str


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: str = "member"


class BudgetRequest(BaseModel):
    monthly_limit: float
    alert_enabled: bool = True


class ReminderRequest(BaseModel):
    title: str
    amount: Optional[float] = None
    due_day: int
    active: bool = True


class CommentRequest(BaseModel):
    content: str


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    two_factor_enabled: Optional[bool] = None
