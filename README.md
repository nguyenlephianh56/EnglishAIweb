# EnglishAI — Adaptive English Learning
## 1. Giới thiệu

**EnglishAI** là ứng dụng web học tiếng Anh thích ứng, hỗ trợ luyện tập bốn kỹ năng **Nghe, Nói, Đọc, Viết**, tích hợp Google Gemini API để chấm bài Viết/Nói, phân tích điểm yếu và cá nhân hóa lộ trình học tập.

- **Tên đề tài:** Ứng dụng web học kỹ năng tiếng Anh thích ứng, tích hợp AI đánh giá viết, nói và phân tích điểm yếu.
- **Học phần:** Đồ án Cơ sở 4 — VKU, HK1 năm học 2026–2027.

## 2. Chức năng chính

| Vai trò | Chức năng |
| --- | --- |
| **Student** | Tham gia lớp, làm bài được giao, tự luyện, xem kết quả, hồ sơ kỹ năng và lộ trình cá nhân. |
| **Teacher** | Quản lý lớp, tạo bài thủ công hoặc bằng AI, giao bài có hạn nộp, chấm/sửa điểm và theo dõi học sinh. |
| **Admin** | Quản lý tài khoản, duyệt giáo viên, quản lý thư viện bài tập, duyệt đề xuất, xử lý báo lỗi và theo dõi sử dụng AI. |

**Tích hợp AI:** sinh bài tập, đánh giá Writing/Speaking, phân tích điểm yếu và đề xuất lộ trình. Bài Nghe/Đọc được chấm tự động theo đáp án. Điểm AI chỉ mang tính tham khảo; giáo viên có thể điều chỉnh, bài AI sinh cần được duyệt trước khi sử dụng. Đánh giá phát âm giới hạn ở mức từ.

## 3. Công nghệ và kiến trúc

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React, Vite, TypeScript, Tailwind CSS, TanStack Query, React Router, Recharts |
| Backend | Node.js, Express, TypeScript, Zod, JWT, bcryptjs, Multer, node-cron |
| Database | PostgreSQL, Prisma ORM |
| AI & Audio | Google Gemini API, AIProvider, MediaRecorder, Speech Synthesis |
| Dev & Test | Docker Compose, Git, Vitest, Supertest |

```mermaid
flowchart LR
    FE[React] <-->|REST API / JWT| BE[Express]
    BE <--> DB[(Prisma / PostgreSQL)]
    BE <--> AI[AIProvider / Gemini]
```

```text
EnglishAIweb/
├── client/             # Frontend
├── server/             # Backend
│   ├── prisma/         # Schema, migrations, seed
│   ├── scripts/        # Đánh giá AI
│   └── src/
│       ├── ai/         # AI provider, prompts, schemas
│       ├── config/     # Cấu hình
│       ├── jobs/       # Tác vụ định kỳ
│       ├── middlewares/# Xác thực, phân quyền
│       └── modules/    # Nghiệp vụ
├── docs/               # Tài liệu
├── docker-compose.yml
└── README.md
```

## 4. Cài đặt và chạy dự án

**Yêu cầu:** Node.js LTS (20+), npm, Git, Docker Compose và [Gemini API key](https://aistudio.google.com/apikey).

### Bước 1: Clone và cài đặt

```bash
git clone https://github.com/nguyenlephianh56/EnglishAIweb.git
cd EnglishAIweb
docker compose up -d                     # Khởi động PostgreSQL
npm install                              # Công cụ kiểm thử ở thư mục gốc
cd server && npm install                # Cài đặt backend
cp .env.example .env                     # Tạo file môi trường
```

### Bước 2: Cấu hình `server/.env`

Điền API key và kiểm tra các biến sau (giữ các biến còn lại từ `.env.example`):

```dotenv
PORT=4000
DATABASE_URL="postgresql://english_user:english_password@localhost:5432/english_learning"
JWT_SECRET="replace-with-a-long-random-secret"
CLIENT_ORIGIN="http://localhost:5173"
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.6-flash
AI_TIMEOUT_MS=30000
```

`DATABASE_URL` phải khớp với `docker-compose.yml`; chọn model Gemini mà API key hỗ trợ. Không commit `.env` lên GitHub.

### Bước 3: Chạy backend

Trong thư mục `server/`:

```bash
npx prisma migrate dev --name init        # Khởi tạo database
npm run db:seed                           # Nạp tài khoản demo và prompt mẫu
npm run dev                               # http://localhost:4000
```

### Bước 4: Chạy frontend

Mở terminal mới tại thư mục gốc dự án:

```bash
cd client && npm install && npm run dev   # http://localhost:5173
```

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:4000
- **Health check:** http://localhost:4000/api/v1/health
- **Database check:** http://localhost:4000/api/v1/health/db

## 5. Tài khoản demo

| Vai trò | Email |
| --- | --- |
| Admin | `admin@englishai.com` |
| Teacher | `teacher@englishai.com` |
| Student | `student1@englishai.com`, `student2@englishai.com`, `student3@englishai.com` |

**Mật khẩu chung:** `Demo@123456` (chỉ dùng cho demo sau khi chạy seed).

## 6. Lệnh hỗ trợ và kiểm thử

Chạy trong thư mục `server/`:

```bash
npx prisma studio                         # Quản lý database
npm run db:seed                           # Nạp lại dữ liệu mẫu
npm run ai:ping                           # Kiểm tra kết nối Gemini
npm run eval:ai -- --dry-run              # Kiểm tra bộ mẫu, không gọi AI
npm run eval:ai                           # Đánh giá AI trên bộ mẫu Writing
npx vitest run --no-file-parallelism src/  # Chạy test tuần tự theo file
```

**Windows PowerShell:** nếu bị chặn script, dùng `npm.cmd`, `npx.cmd` thay cho `npm`, `npx` và `Copy-Item .env.example .env` thay cho `cp`. Ví dụ:

```bash
npx.cmd prisma studio
npm.cmd run db:seed
npm.cmd run eval:ai -- --dry-run
npx.cmd vitest run --no-file-parallelism src/
```

Nên sử dụng database kiểm thử riêng hoặc database demo có thể tạo lại. Để dừng dự án, nhấn `Ctrl+C` tại hai terminal, sau đó chạy ở thư mục gốc:

```bash
docker compose down
```

## 7. Nhóm phát triển và tài liệu

Dự án được thực hiện bởi nhóm hai sinh viên VKU: **Backend & AI** và **Frontend & UI**.

- [Công nghệ và cấu trúc dự án](TECH_STACK_AND_STRUCTURE.md)
- [Kế hoạch và phân công](WORKS.md)
- [Tài liệu kỹ thuật](docs/)

Hướng phát triển: mở rộng dạng bài, nâng cao học thích ứng và bổ sung công cụ ôn tập.
