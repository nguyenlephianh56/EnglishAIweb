# WORKS.md — Phân công và tiến độ

**Đề tài:** Ứng dụng web học kỹ năng tiếng Anh thích ứng, tích hợp AI đánh giá viết, nói và phân tích điểm yếu
**Cập nhật lần cuối:** 29/10/2026 | **Hạn nộp:** 01/12/2026 (hạn nội bộ: 30/11) | **Còn lại:** 33 ngày

> Cách dùng: tick `[x]` khi xong, `[~]` khi đang làm, `[ ]` khi chưa làm. Cập nhật file này và ghi một dòng vào mục 8 **mỗi lần làm xong một việc**. Mỗi 2 ngày họp 15 phút để đồng bộ.

**Ưu tiên:** `P0` bắt buộc (cắt là trượt đề tài) | `P1` mong muốn (làm nếu đúng tiến độ) | `P2` mở rộng (chỉ ghi vào báo cáo)

---

## 1. Phân công tổng quát

| | **Người 1: Backend + AI** | **Người 2: Frontend + UI** |
|---|---|---|
| Họ tên | ………………… | ………………… |
| Thư mục chính | `server/` | `client/` |
| Phụ trách | CSDL, API, đăng nhập/phân quyền, chấm tự động, lớp gọi AI, chấm Viết/Nói, hồ sơ kỹ năng, lộ trình, nhắc hạn, đánh giá độ tin cậy AI | Giao diện 3 vai trò, các component dạng bài, thư viện tự luyện, ghi âm/phát âm thanh, biểu đồ, thiết kế Figma |
| Báo cáo | Chương 3 (phần CSDL, kiến trúc), chương 4 (phần AI), chương 6 (đánh giá AI) | Chương 1, 2, chương 3 (phần giao diện), chương 5 (ảnh giao diện) |

**Quy tắc làm việc**
1. Người 1 chỉ sửa `server/`, Người 2 chỉ sửa `client/`. File chung (`docs/`, `README`) báo nhau trước khi sửa.
2. **Chốt hợp đồng API trong ngày 1-2** (`docs/api.md`). Người 2 dùng dữ liệu giả cho đến khi API sẵn sàng.
3. Mỗi việc một nhánh `feature/...`, gộp vào `dev` bằng Pull Request, người kia xem qua.
4. Không commit `.env` (chứa API key).
5. Mỗi người **viết báo cáo phần mình dần theo từng sprint** và chụp ảnh màn hình ngay khi chức năng chạy được.

---

## 2. Tổng quan tiến độ

| Sprint | Thời gian | Mục tiêu "xong là đạt" | Người 1 | Người 2 | Trạng thái |
|---|---|---|:-:|:-:|---|
| 1 | 29/10 - 04/11 | Khung dự án, đăng nhập, phân quyền 3 vai trò, quản lý lớp | 0% | 0% | Chưa bắt đầu |
| 2 | 05/11 - 11/11 | Kho bài + 4 dạng chấm tự động, thư viện tự luyện, giao bài có hạn nộp | 0% | 0% | Chưa bắt đầu |
| 3 | 12/11 - 18/11 | AI sinh bài, AI chấm Viết, Nghe điền từ, hồ sơ kỹ năng + biểu đồ | 0% | 0% | Chưa bắt đầu |
| 4 | 19/11 - 25/11 | AI chấm Nói, giáo viên sửa điểm, admin, đánh giá AI, **chốt tính năng 25/11** | 0% | 0% | Chưa bắt đầu |
| 5 | 26/11 - 01/12 | Sửa lỗi, báo cáo ≥ 20 trang, slide tiếng Anh, video demo, nộp bài | 0% | 0% | Chưa bắt đầu |

> Lưu ý: kế hoạch 7 tuần gốc đã mất 3 tuần, nên kế hoạch này nén còn 5 sprint. Vì vậy **phải bám `P0` trước**, chỉ làm `P1` khi sprint đó đã xong `P0`.

---

## 3. NGƯỜI 1: Backend + AI

### Sprint 1 (29/10 - 04/11): Nền tảng
- [ ] P0 Cài môi trường: Node.js LTS, Git, Docker Desktop, VS Code, Postman
- [ ] P0 Dựng server Express + TypeScript + Prisma, kết nối PostgreSQL (docker compose)
- [ ] P0 Viết `schema.prisma` theo ERD, chạy migrate, viết `seed.ts` (1 admin, 1 giáo viên, 3 học sinh)
- [ ] P0 Đăng ký, đăng nhập, JWT, băm mật khẩu (bcrypt), `GET /auth/me`
- [ ] P0 Middleware `requireRole`; giáo viên đăng ký xong ở trạng thái `PENDING`
- [ ] P0 API admin: duyệt giáo viên, khóa/mở khóa tài khoản
- [ ] P0 API lớp: tạo lớp, sinh mã lớp, học sinh tham gia bằng mã, thêm/xóa học sinh
- [ ] P0 Viết `docs/api.md` (hoặc Postman collection) cho Người 2

### Sprint 2 (05/11 - 11/11): Kho bài và chấm tự động
- [ ] P0 CRUD bài tập, lọc theo kỹ năng/cấp độ/dạng/chủ đề/trạng thái, phân trang
- [ ] P0 Zod schema cho các dạng bài: `multiple_choice`, `fill_blank`, `matching`, `error_correction`, `listening_fill`, `writing`, `speaking`
- [ ] P0 Registry chấm tự động + hàm chấm cho 4 dạng: trắc nghiệm, điền từ, nối cặp, sửa lỗi
- [ ] P0 API nộp bài (`attempts`): chấm tự động, lưu điểm và danh sách lỗi
- [ ] P0 API giao bài (`assignments`): hạn nộp, đánh dấu trễ hạn, danh sách bài được giao của học sinh, bài nộp của lớp
- [ ] P0 Kiểm tra phân quyền: giáo viên chỉ thấy lớp của mình, học sinh không vào được API giáo viên/admin
- [ ] P1 Dạng bài sắp xếp từ thành câu

### Sprint 3 (12/11 - 18/11): Lớp AI, chấm Viết, hồ sơ kỹ năng
- [ ] P0 Lớp AI: `AIProvider`, `GeminiProvider`, ép trả JSON, kiểm tra Zod, thử lại 1 lần
- [ ] P0 Cache kết quả, giới hạn lượt mỗi người mỗi ngày, ghi `ai_usage_logs`
- [ ] P0 Mẫu prompt (lưu file hoặc bảng `prompt_templates`)
- [ ] P0 AI sinh bài nháp (trạng thái `DRAFT`) cho giáo viên/admin
- [ ] P0 AI chấm Viết: điểm theo tiêu chí, lỗi có vị trí + loại lỗi + bản sửa, nhận xét tiếng Việt
- [ ] P0 AI viết kịch bản bài Nghe, lưu vào `content`
- [ ] P0 Cập nhật `skill_profiles` sau mỗi lần làm bài: điểm, mức A1-B2, thống kê loại lỗi
- [ ] P0 API hồ sơ kỹ năng (học sinh xem, giáo viên xem học sinh trong lớp)
- [ ] P0 Bắt đầu **thu 30-50 bài viết mẫu** để chấm tay (dùng ở Sprint 4)

### Sprint 4 (19/11 - 25/11): Chấm Nói, đánh giá, bổ sung
- [ ] P0 Upload âm thanh (multer, giới hạn dung lượng) → chữ hóa → so khớp với đề/câu mẫu → chấm Nói theo từ → **xóa file âm thanh**
- [ ] P0 API giáo viên sửa điểm và nhận xét (ghi đè điểm AI)
- [ ] P0 Script so sánh điểm AI với chấm tay (độ chênh trung bình, hệ số tương quan, tỷ lệ lệch > 1 mức)
- [ ] P0 Viết test phân quyền (Postman hoặc Jest + Supertest)
- [ ] P1 AI phân tích học sinh và cả lớp
- [ ] P1 Lộ trình học cá nhân (`learning_paths`) và API "Gợi ý cho bạn"
- [ ] P1 Nhắc hạn: `node-cron` + bảng `notifications` (thông báo trong ứng dụng)
- [ ] P1 Thống kê admin, báo lỗi bài, `audit_logs`
- [ ] P1 Gợi ý nhận xét cho giáo viên
- [ ] P2 Nhắc hạn qua email, nhập bài từ CSV/JSON

### Sprint 5 (26/11 - 01/12): Hoàn thiện
- [ ] P0 Sửa lỗi, kiểm thử toàn bộ theo test case
- [ ] P0 Dữ liệu demo (seed) và kết quả AI lưu sẵn cho buổi demo
- [ ] P0 Chạy thử kịch bản demo trọn vẹn ít nhất 2 lần
- [ ] P0 Hoàn thiện phần báo cáo của mình

---

## 4. NGƯỜI 2: Frontend + UI

### Sprint 1 (29/10 - 04/11): Nền tảng
- [ ] P0 Cài môi trường: Node.js LTS, Git, VS Code
- [ ] P0 Dựng Vite + React + TypeScript + Tailwind, React Router, TanStack Query, axios (tự gắn JWT)
- [ ] P0 Tạo thiết kế Figma bằng `FIGMA_PROMPT.md`, chọn màn hình làm trước
- [ ] P0 Bộ component cơ bản: Button, Input, Card, Modal, Table, Badge, Tabs
- [ ] P0 Layout 3 vai trò (sidebar, topbar) và chặn truy cập trang theo vai trò
- [ ] P0 Trang đăng nhập, đăng ký (chọn học sinh/giáo viên), trang "đang chờ duyệt"
- [ ] P0 Trang hồ sơ cá nhân

### Sprint 2 (05/11 - 11/11): Bài tập và thư viện
- [ ] P0 Giáo viên: danh sách lớp, tạo lớp, chi tiết lớp (mã lớp, danh sách học sinh)
- [ ] P0 Học sinh: nhập mã lớp, xem lớp đã tham gia
- [ ] P0 Registry component + 4 component: MultipleChoice, FillBlank, Matching, ErrorCorrection
- [ ] P0 Thư viện tự luyện: lọc, tìm kiếm, card bài, chế độ luyện tập (xem giải thích ngay)
- [ ] P0 Trang kết quả sau khi làm bài
- [ ] P0 Form tạo bài (giáo viên/admin), form thay đổi theo dạng bài
- [ ] P0 Giáo viên giao bài (chọn lớp, hạn nộp); học sinh xem "Bài được giao" với trạng thái chưa làm/đã nộp/trễ hạn

### Sprint 3 (12/11 - 18/11): AI trên giao diện
- [ ] P0 Form "Nhờ AI sinh bài" (kỹ năng, cấp độ, chủ đề, dạng, số câu)
- [ ] P0 Màn duyệt bản nháp AI (xem, sửa câu hỏi và đáp án, xuất bản)
- [ ] P0 Màn Viết: ô soạn thảo, hiển thị lỗi được đánh dấu trên văn bản, giải thích, bản sửa
- [ ] P0 Component Nghe: phát bằng `speechSynthesis`, nút nghe lại, điền từ
- [ ] P0 Trang hồ sơ kỹ năng: biểu đồ radar 4 kỹ năng, tiến bộ theo thời gian, loại lỗi hay mắc (Recharts)
- [ ] P0 Giáo viên: danh sách bài nộp của lớp

### Sprint 4 (19/11 - 25/11): Nói, admin, bổ sung
- [ ] P0 Component ghi âm (MediaRecorder: bắt đầu/dừng, đếm giờ, nghe lại, gửi) và màn kết quả Nói theo từng từ
- [ ] P0 Màn chấm của giáo viên: xem bài, sửa điểm, nhận xét, gợi ý AI
- [ ] P0 Admin: quản lý tài khoản, duyệt giáo viên, quản lý thư viện bài, thống kê cơ bản
- [ ] P1 Giáo viên: phân tích học sinh và lớp
- [ ] P1 Lộ trình học, mục "Gợi ý cho bạn", chuông thông báo
- [ ] P1 Admin: cấu hình AI (prompt, giới hạn lượt), xử lý báo lỗi, nhật ký
- [ ] P1 Chế độ thi thử có tính giờ
- [ ] P1 Giao diện dùng được trên điện thoại
- [ ] P2 Flashcard lặp lại ngắt quãng, huy hiệu, chuỗi ngày học

### Sprint 5 (26/11 - 01/12): Hoàn thiện
- [ ] P0 Trạng thái trống/đang tải/lỗi cho mọi trang, thông báo lỗi dễ hiểu
- [ ] P0 Chụp ảnh màn hình đầy đủ cho báo cáo
- [ ] P0 Làm slide tiếng Anh (phần giao diện, demo)
- [ ] P0 Hoàn thiện phần báo cáo của mình

---

## 5. Việc làm chung (cả hai)

| Việc | Sprint | Phụ trách | Xong |
|---|---|---|:-:|
| Use case, ERD, kiến trúc (vẽ bằng draw.io) | 1 | Cả hai | [ ] |
| Chốt hợp đồng API (`docs/api.md`) | 1 | Người 1 viết, Người 2 duyệt | [ ] |
| Dựng repo GitHub, nhánh `main`/`dev` | 1 | Người 1 | [ ] |
| Nhập ≥ 60 bài mẫu vào thư viện (mỗi người ~30, cả 4 kỹ năng) | 2-3 | Cả hai | [ ] |
| Bảng test case theo từng vai trò | 4 | Cả hai | [ ] |
| Nhờ giáo viên/người giỏi tiếng Anh chấm tay 30-50 bài Viết, 20-30 bản ghi Nói | 4 | Cả hai | [ ] |
| Thử nghiệm người dùng 5-10 người + khảo sát ngắn | 5 | Người 2 | [ ] |
| Báo cáo ≥ 20 trang nội dung (.doc) | 1-5 | Cả hai | [ ] |
| Slide tiếng Anh | 5 | Cả hai | [ ] |
| Video demo dự phòng | 5 | Người 2 | [ ] |
| Chuẩn bị câu hỏi hội đồng, tập thuyết trình | 5 | Cả hai | [ ] |

---

## 6. Tiến độ báo cáo (viết dần)

| Chương | Phụ trách | Hạn viết xong bản đầu |
|---|---|---|
| 1. Mở đầu | Người 2 | 04/11 |
| 2. Khảo sát và cơ sở lý thuyết | Người 2 | 11/11 |
| 3. Phân tích và thiết kế hệ thống | Cả hai (CSDL, kiến trúc: Người 1; giao diện: Người 2) | 18/11 |
| 4. Thiết kế phần AI | Người 1 | 22/11 |
| 5. Cài đặt hệ thống | Cả hai | 26/11 |
| 6. Kiểm thử và đánh giá | Người 1 (đánh giá AI), Người 2 (người dùng, giao diện) | 28/11 |
| 7. Kết luận, tài liệu tham khảo, phụ lục | Cả hai | 30/11 |

---

## 7. Nếu trễ tiến độ: cắt theo thứ tự

1. Mức mở rộng (`P2`)
2. Chế độ thi thử, gợi ý bài
3. Nhắc hạn qua email
4. Lộ trình AI cá nhân
5. Bớt số dạng bài (giữ tối thiểu: trắc nghiệm, điền từ, sửa lỗi, Viết AI, Nói AI, Nghe điền từ)

**Tuyệt đối không cắt:** vòng lặp lõi (làm bài → chấm → hồ sơ kỹ năng), phân quyền 3 vai trò, thư viện tự luyện, giao bài có hạn nộp, đánh giá điểm AI.

**Quy tắc kiểm tra:** sprint nào còn việc `P0` chưa xong thì **dừng việc `P1`**, dồn sức hoàn thành `P0` trước.

---

## 8. Nhật ký tiến độ

| Ngày | Người | Việc đã làm | Ghi chú/vướng mắc |
|---|---|---|---|
| 29/10/2026 | Cả hai | Chốt công nghệ (TypeScript, React, Express, Prisma, PostgreSQL, Gemini), tạo WORKS.md | |
| | | | |
| | | | |
