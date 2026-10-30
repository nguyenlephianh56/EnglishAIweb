# Công nghệ, kiến trúc và cấu trúc dự án

Cập nhật: 29/10/2026. Điều kiện của nhóm: 2 sinh viên, chưa vững ngôn ngữ nào, chưa có nền tảng AI, cần API miễn phí/rẻ, còn khoảng 33 ngày đến hạn nộp (01/12/2026).

---

## 1. Kết luận nhanh

| Tầng | Chọn | Ghi chú |
|---|---|---|
| Ngôn ngữ (cả FE và BE) | **TypeScript** | Một ngôn ngữ cho cả hai phía |
| Frontend | **React + Vite + Tailwind CSS** | Thêm React Router, TanStack Query, Recharts |
| Backend | **Node.js + Express** | Thêm Zod (kiểm tra dữ liệu), JWT + bcrypt, multer (upload âm thanh), node-cron (nhắc hạn) |
| ORM | **Prisma** | Viết schema một lần, tự sinh bảng và kiểu dữ liệu |
| Database | **PostgreSQL** (chạy bằng Docker) | Cột `JSONB` phù hợp lưu nội dung bài tập |
| AI chấm/sinh bài/phân tích | **Google Gemini API (gói miễn phí, model Flash)** | Đặt sau một lớp `AIProvider` để đổi nhà cung cấp dễ |
| Chuyển giọng nói thành chữ | Gemini (nhận audio) hoặc Web Speech API của trình duyệt (dự phòng) | |
| Đọc văn bản thành giọng (Nghe) | **Web Speech API (speechSynthesis)** của trình duyệt | Miễn phí, không cần API |
| Công cụ | Git/GitHub, Postman, draw.io, Figma | |

## 2. Vì sao chọn như vậy

**Một ngôn ngữ cho cả hai phía (TypeScript).** Nhóm chưa vững ngôn ngữ nào, nên học một ngôn ngữ sẽ nhanh hơn học hai (ví dụ Python cho backend và JavaScript cho frontend). Hai người cũng đọc và hỗ trợ code của nhau được, và có thể dùng chung kiểu dữ liệu (ví dụ cấu trúc bài tập).

**Không cần Python.** Đề tài chỉ *gọi API* AI, không huấn luyện mô hình, nên không cần thư viện AI của Python. Gọi API từ Node.js dễ như từ Python.

**Zod rất hợp với đề tài này.** Yêu cầu của bạn là AI phải trả JSON theo khuôn cố định và backend kiểm tra trước khi lưu. Zod làm đúng việc đó, đồng thời kiểm tra luôn dữ liệu bài tập và dữ liệu từ form.

**PostgreSQL thay vì SQLite.** Hệ thống có nhiều quan hệ (lớp, bài, bài nộp, hồ sơ kỹ năng) và nhiều dữ liệu dạng JSON (nội dung bài, danh sách lỗi). PostgreSQL xử lý tốt cả hai, và Docker giúp cả hai máy chạy giống hệt nhau chỉ bằng một lệnh.

**Tránh:** Java/Spring hoặc C#/.NET (nặng, nhiều cấu hình cho người mới), PHP/Laravel (trộn giao diện và logic, khó tách Client-Server như đề tài yêu cầu), Next.js (thêm khái niệm server component, dễ rối khi chưa có nền tảng).

## 3. Dịch vụ AI miễn phí: những điều cần biết

Đã kiểm tra thông tin đến tháng 10/2026:

- Gemini API có gói miễn phí, không cần thẻ tín dụng, dùng được các model **Flash/Flash-Lite**. Các model **Pro** không còn nằm trong gói miễn phí từ tháng 4/2026.
- Giới hạn (số yêu cầu mỗi phút/ngày) **thay đổi theo thời gian và theo tài khoản**. Xem số chính xác trong Google AI Studio (aistudio.google.com/rate-limit), không nên tin số trong bài báo.
- Tên model thay đổi và model cũ bị ngừng (ví dụ họ Gemini 2.0 Flash dự kiến ngừng từ 01/06/2026). Vì vậy **để tên model trong file `.env`**, đừng ghi cứng trong code.
- **Quyền riêng tư:** ở gói miễn phí, Google có thể dùng dữ liệu gửi lên để cải thiện sản phẩm. Chỉ dùng bài viết/giọng nói mẫu, không gửi tên, email hay dữ liệu thật của người dùng. Ghi rõ điều này trong báo cáo (mục quyền riêng tư).
- Có giới hạn lượt gọi nên cần đúng các biện pháp trong đề tài: cache, giới hạn lượt mỗi người mỗi ngày, ưu tiên chấm tự động. Khi gặp lỗi 429 (quá giới hạn), backend thử lại sau vài giây và báo người dùng "thử lại sau".
- Chuẩn bị sẵn **kết quả AI đã lưu** cho buổi demo, phòng khi mạng hoặc API lỗi.

## 4. Mô hình kiến trúc

Không có một chữ viết tắt nào khớp hoàn toàn. Nên mô tả trong báo cáo như sau:

**Tổng thể: Client-Server, giao tiếp bằng REST API, giao diện dạng Single Page Application (SPA).**

```
[Trình duyệt: React SPA]  <--- REST + JSON (JWT) --->  [Express API]  <---> [PostgreSQL]
  - 3 giao diện theo vai trò                            - Route -> Controller -> Service -> Prisma
  - Ghi âm, phát âm thanh                               - Phân quyền, logic chấm, hồ sơ kỹ năng
                                                        - node-cron nhắc hạn
                                                        - Lớp AI (prompt, Zod, cache, giới hạn)
                                                                  |
                                                                  v
                                                         [Gemini API] (chấm, sinh bài, STT)
```

**Backend: kiến trúc phân lớp theo module (tương tự MVC, nhưng không có View vì View là React).**

| Lớp | Vai trò | Tương ứng MVC |
|---|---|---|
| `routes` | Khai báo đường dẫn, gắn middleware (đăng nhập, vai trò, kiểm tra dữ liệu) | Router |
| `controller` | Nhận request, gọi service, trả response | Controller |
| `service` | Toàn bộ logic nghiệp vụ (chấm, cập nhật hồ sơ kỹ năng...) | Model (logic) |
| Prisma | Truy cập dữ liệu | Model (dữ liệu) |

**Frontend: chia theo tính năng (feature-based), logic tách vào custom hook.**

| Lớp | Vai trò | Tương ứng MVVM |
|---|---|---|
| Component | Chỉ hiển thị | View |
| Custom hook (`useExercises`, `useAttempt`...) | Giữ trạng thái, gọi API | ViewModel |
| `api/` + `types/` | Gọi API, kiểu dữ liệu | Model |

**Mẫu thiết kế quan trọng nhất: Registry cho dạng bài** (đúng ý mục 8.2 của đề tài). Mỗi dạng bài gồm 3 phần: Zod schema, hàm chấm (backend), component hiển thị (frontend). Thêm dạng mới chỉ cần thêm 3 phần này và đăng ký vào registry, không sửa phần khác.

## 5. Cấu trúc thư mục

```
english-learning/
├─ docker-compose.yml          # PostgreSQL
├─ README.md
├─ WORKS.md                    # Phân công và tiến độ
├─ docs/                       # ERD, use case, API contract, ảnh Figma
│
├─ server/                     # Người 1 phụ trách
│  ├─ package.json, tsconfig.json, .env.example
│  ├─ prisma/
│  │  ├─ schema.prisma         # Toàn bộ bảng
│  │  └─ seed.ts               # Tài khoản mẫu, bài mẫu
│  └─ src/
│     ├─ server.ts             # Khởi động
│     ├─ app.ts                # Cấu hình Express
│     ├─ config/env.ts
│     ├─ middlewares/          # auth, requireRole, validate, errorHandler, aiRateLimit
│     ├─ modules/              # Mỗi module: routes, controller, service, schema
│     │  ├─ auth/
│     │  ├─ users/
│     │  ├─ classes/
│     │  ├─ exercises/
│     │  ├─ assignments/
│     │  ├─ attempts/
│     │  ├─ grading/           # auto/ (mỗi dạng 1 file) + registry.ts
│     │  ├─ skill-profiles/
│     │  ├─ learning-paths/
│     │  ├─ notifications/
│     │  ├─ reports/
│     │  ├─ analytics/
│     │  └─ admin/
│     ├─ ai/
│     │  ├─ provider.ts        # interface AIProvider
│     │  ├─ gemini.provider.ts
│     │  ├─ ai.service.ts      # cache, giới hạn, retry, ghi log
│     │  ├─ prompts/           # writing, speaking, generate, analysis, path
│     │  └─ schemas/           # Zod schema cho JSON AI trả về
│     ├─ jobs/reminder.job.ts  # node-cron
│     └─ utils/
│
└─ client/                     # Người 2 phụ trách
   ├─ package.json, vite.config.ts, index.html
   └─ src/
      ├─ main.tsx, App.tsx, index.css
      ├─ app/                  # router, providers, route guard
      ├─ api/                  # axios client + hàm gọi từng module
      ├─ types/                # kiểu dữ liệu dùng chung
      ├─ hooks/                # useAuth, useExercises...
      ├─ components/
      │  ├─ ui/                # Button, Input, Card, Modal, Table, Badge...
      │  └─ layout/            # Sidebar, Topbar, 3 layout theo vai trò
      └─ features/
         ├─ auth/
         ├─ exercises/
         │  └─ renderers/      # 1 component mỗi dạng bài + registry
         ├─ student/           # dashboard, library, assigned, profile, path
         ├─ teacher/           # classes, create, assign, grading, analytics
         ├─ admin/             # users, library, reports, ai-config, logs
         └─ shared/            # Recorder, AudioPlayer, ErrorHighlight, RadarChart
```

## 6. Quy ước chung của hai người

**API:** tiền tố `/api/v1`. Mọi response có dạng:

```json
{ "data": { }, "error": null }
{ "data": null, "error": { "code": "FORBIDDEN", "message": "Bạn không có quyền" } }
```

**Vai trò:** `STUDENT`, `TEACHER`, `ADMIN`. Middleware `requireRole(...)` đặt ở route, và service phải kiểm tra thêm "giáo viên chỉ thấy lớp của mình".

**Chốt hợp đồng API trước (ngày 1-2):** Người 1 liệt kê endpoint và dữ liệu trả về trong `docs/api.md` (hoặc Postman). Người 2 làm giao diện bằng dữ liệu giả (mock) cho đến khi API sẵn sàng, nên không ai phải chờ ai.

**Luồng gọi AI (trong `ai.service.ts`):**

1. Kiểm tra giới hạn lượt của người dùng. Hết lượt thì trả lỗi rõ ràng.
2. Tìm trong cache (khóa là hash của nội dung). Có thì trả luôn.
3. Lấy mẫu prompt, điền dữ liệu, gọi provider, yêu cầu trả JSON.
4. Kiểm tra bằng Zod. Sai định dạng thì thử lại 1 lần, vẫn sai thì báo lỗi.
5. Lưu cache, ghi `ai_usage_logs`, trả kết quả.

**Git:**

- Nhánh `main` (luôn chạy được) và `dev`. Mỗi việc một nhánh `feature/<ten-viec>`, gộp vào `dev` bằng Pull Request, người kia xem qua.
- Người 1 chỉ sửa `server/`, Người 2 chỉ sửa `client/` thì gần như không xung đột. File dùng chung (`docs/`, `README`) báo nhau trước khi sửa.
- Commit rõ nghĩa, ví dụ `feat(auth): add login api`, `fix(client): library filter`.
- **Không commit file `.env`** (chứa API key). Chỉ commit `.env.example`.

## 7. Khởi chạy

```bash
# 1. Chạy CSDL
docker compose up -d

# 2. Backend
cd server
npm install
cp .env.example .env          # điền GEMINI_API_KEY (lấy ở aistudio.google.com)
npx prisma migrate dev --name init
npx prisma db seed            # sau khi viết seed.ts
npm run dev                   # http://localhost:4000

# 3. Frontend (cửa sổ terminal khác)
cd client
npm install
npm run dev                   # http://localhost:5173
```

Lấy API key: đăng nhập aistudio.google.com bằng tài khoản Google, tạo API key, dán vào `GEMINI_API_KEY`.
