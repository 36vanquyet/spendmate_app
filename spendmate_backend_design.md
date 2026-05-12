# SpendMate - Backend Design

## 1. Kiến trúc tổng quan
- API: REST / GraphQL
- Backend: Node.js + Express / Python FastAPI
- Database: PostgreSQL / MySQL
- Storage: AWS S3 / Firebase Storage
- Notification: Push/Email
- Authentication: JWT + bcrypt/Argon2
- Role-based access: User, Admin, Member

```mermaid
flowchart TD
    FE[Frontend: iOS/Android/Web/Desktop] --> API[Backend API (REST/GraphQL)]
    API --> DB[(Database: Users, Groups, Transactions, Categories)]
    API --> Storage[(Cloud Storage: hóa đơn, file báo cáo)]
    API --> Notifications[Push/Email Notification Service]
    API --> Auth[Authentication & Authorization: JWT, 2FA]
    API --> Localization[Multi-language & user settings]
```

## 2. Database Schema

### 2.1 Users
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| email | varchar | Unique |
| phone | varchar | Optional |
| password_hash | varchar | Hashed password |
| full_name | varchar | |
| avatar_url | varchar | URL hình ảnh |
| language | varchar | Mã ngôn ngữ |
| created_at | timestamp | |
| updated_at | timestamp | |

### 2.2 Groups
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | varchar | Tên nhóm / gia đình |
| owner_id | UUID | Admin user |
| created_at | timestamp | |
| updated_at | timestamp | |

### 2.3 GroupMembers
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| group_id | UUID | FK Groups |
| user_id | UUID | FK Users |
| role | enum | Admin / Member |
| joined_at | timestamp | |

### 2.4 Categories
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Null nếu global |
| name | varchar | Tên danh mục |
| type | enum | Thu / Chi |

### 2.5 Transactions
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK Users |
| group_id | UUID | Optional |
| category_id | UUID | FK Categories |
| amount | decimal | Số tiền |
| type | enum | Thu / Chi |
| note | text | Ghi chú |
| date | date | Ngày giao dịch |
| receipt_url | varchar | URL hóa đơn |
| created_at | timestamp | |
| updated_at | timestamp | |

## 3. REST API Endpoints

### 3.1 Auth
- `POST /api/auth/register` → Đăng ký
- `POST /api/auth/login` → Đăng nhập
- `POST /api/auth/refresh-token` → Refresh token

### 3.2 Users
- `GET /api/users/me` → Thông tin người dùng
- `PUT /api/users/me` → Cập nhật thông tin, ngôn ngữ, avatar

### 3.3 Transactions
- `GET /api/transactions` → Lọc theo ngày/tháng/năm, cá nhân hoặc nhóm
- `POST /api/transactions` → Thêm giao dịch
- `PUT /api/transactions/:id` → Cập nhật
- `DELETE /api/transactions/:id` → Xóa
- `GET /api/transactions/report` → Báo cáo, thống kê

### 3.4 Categories
- `GET /api/categories` → Lấy danh mục
- `POST /api/categories` → Thêm danh mục
- `PUT /api/categories/:id` → Sửa
- `DELETE /api/categories/:id` → Xóa

### 3.5 Groups
- `GET /api/groups` → Lấy nhóm user tham gia
- `POST /api/groups` → Tạo nhóm
- `GET /api/groups/:id` → Chi tiết nhóm, thành viên, chi tiêu
- `POST /api/groups/:id/members` → Thêm thành viên
- `DELETE /api/groups/:id/members/:user_id` → Xóa thành viên
- `POST /api/groups/:id/transactions` → Thêm giao dịch nhóm

### 3.6 Notifications
- `GET /api/notifications` → Lấy danh sách
- `POST /api/notifications` → Tạo nhắc nhở / cảnh báo

## 4. Multi-language Support
- Header: `Accept-Language`
- Backend trả về message & labels theo ngôn ngữ user
- User setting `language` quyết định ngôn ngữ hiển thị

## 5. Backend Tech Stack
| Layer | Tech |
|-------|------|
| Framework | Node.js + Express / FastAPI |
| Database | PostgreSQL / MySQL |
| Auth | JWT + bcrypt / Argon2 |
| Storage | AWS S3 / Firebase Storage |
| Push Notification | Firebase Cloud Messaging / OneSignal |
| Background Jobs | Celery / BullMQ |
| Containerization | Docker |

