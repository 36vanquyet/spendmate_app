# SpendMate MVP

Ứng dụng quản lý chi tiêu cá nhân/nhóm theo tài liệu `expense_manager_app_design.md`.

## Tính năng đã có
- Đăng ký, đăng nhập JWT
- CRUD giao dịch thu/chi
- Nhóm và vai trò admin/member (tạo nhóm, liệt kê nhóm, thêm thành viên)
- Bình luận giao dịch chung
- Đặt ngân sách tháng + cảnh báo vượt mức
- Nhắc nhở chi tiêu định kỳ
- Thống kê theo ngày/tuần/tháng/năm
- Xuất báo cáo Excel và PDF
- Frontend responsive cho mobile/desktop

## Công nghệ
- Backend: FastAPI + SQLAlchemy + SQLite
- Frontend: HTML/CSS/JavaScript

## Chạy ứng dụng
1. Cài thư viện:
```bash
pip install -r requirements.txt
```

2. Chạy backend:
```bash
uvicorn backend.app.main:app --reload --port 8000
```

3. Chạy frontend (terminal mới):
```bash
python -m http.server 5500 --directory frontend
```

4. Mở trình duyệt:
- `http://127.0.0.1:5500`

## Ghi chú
- File cơ sở dữ liệu được tạo tại gốc dự án: `spendmate.db`
- Bản MVP tập trung vào luồng chức năng cốt lõi, có thể mở rộng thêm OAuth, upload hóa đơn lên cloud, đồng bộ offline, push notification.
