# ĐỒ ÁN CƠ SỞ 4: MÔ TẢ ĐỀ TÀI (bản rút gọn)

> Ngữ cảnh cho trợ lý AI. Đề tài đã **đổi** so với hướng cũ (ngôn ngữ ký hiệu/MediaPipe không còn áp dụng). Cập nhật 29/10/2026.

## 0. Bối cảnh

- VKU (Đại học CNTT và Truyền thông Việt-Hàn), Khoa KHMT, CNTT, chuyên ngành Công nghệ phần mềm, năm 3. Học phần **Đồ án Cơ sở 4 (1 tín chỉ)**, HK1 2026-2027. Hướng đề tài: ứng dụng AI, mô hình Client-Server.
- Nhóm **2 sinh viên**, làm **web**, **chưa có nền tảng AI** (chỉ gọi API, không huấn luyện mô hình), **chưa vững ngôn ngữ lập trình nào**, **chưa có API AI trả phí** (dùng gói miễn phí).
- Kết quả cần nộp: hồ sơ phân tích thiết kế, mã nguồn, demo chạy trên máy, **báo cáo (.doc) ≥ 20 trang nội dung** (không tính mục lục, tài liệu tham khảo, phụ lục), **slide tiếng Anh**.
- Mốc: nộp đề cương 11/10/2026 (đã qua), GVHD duyệt 12/10, **nộp kết quả 01/12/2026**, bảo vệ dự kiến 07/12/2026 - 03/01/2027. Đánh giá: GVHD 30%, hội đồng 70%.
- **Tiến độ hiện tại:** chưa làm gì ngoài file mô tả; còn khoảng 33 ngày. Kế hoạch 7 tuần gốc đã nén thành 5 sprint (mục 12).

## 1. Tên đề tài

- **Việt:** Ứng dụng web học kỹ năng tiếng Anh thích ứng, tích hợp AI đánh giá viết, nói và phân tích điểm yếu
- **Anh:** An Adaptive Web Application for English Skills Learning with AI-based Writing and Speaking Assessment and Weakness Analysis

"Thích ứng" = hệ thống ghi nhận trình độ từng học sinh ở từng kỹ năng (hồ sơ kỹ năng) và dựa vào đó gợi ý bài, xây lộ trình, phân tích điểm yếu. Không dùng các từ "thông minh", "toàn diện", "hoàn chỉnh".

## 2. Mục đích

1. Web giúp rèn **4 kỹ năng Nghe, Nói, Đọc, Viết** qua kho bài tập đa dạng.
2. AI **chấm và phản hồi tức thì** (chủ yếu Viết, Nói), **phân tích điểm yếu**, **xây lộ trình cá nhân**.
3. Hỗ trợ **giáo viên**: tạo bài nhanh bằng AI, giao bài có hạn nộp và nhắc hạn, theo dõi và phân tích học sinh.
4. **Thư viện bài tập chung** do admin quản lý để học sinh tự luyện ngoài bài được giao.
5. Vận dụng kiến thức công nghệ phần mềm: phân tích thiết kế, phân quyền, CSDL quan hệ, Client-Server, tích hợp dịch vụ AI, kiểm thử.

## 3. Ý tưởng cốt lõi

Vòng lặp khép kín: **Giáo viên/Admin/AI tạo bài → Học sinh làm (được giao hoặc tự luyện) → Hệ thống chấm (tự động hoặc AI) + tìm lỗi → HỒ SƠ KỸ NĂNG → (gợi ý bài tự luyện, AI xây lộ trình, AI phân tích cho giáo viên) → quay lại tạo/giao bài.**

**Hồ sơ kỹ năng** là trung tâm: mỗi học sinh có điểm và mức ước lượng (A1-B2) cho từng kỹ năng, cùng thống kê loại lỗi hay mắc (thì, mạo từ, giới từ, từ vựng, phát âm). Mọi tính năng "thích ứng" đọc từ đây.

**Hai nguồn bài, một cấu trúc dữ liệu:**

| | Bài giáo viên giao | Bài tự luyện (thư viện chung) |
|---|---|---|
| Người tạo | Giáo viên (tự soạn hoặc AI) | Admin (tự soạn, AI, nhập file, hoặc duyệt đề xuất của giáo viên) |
| Ai làm | Học sinh trong lớp | Mọi học sinh |
| Hạn nộp / số lần | Có / thường 1 lần | Không / thoải mái |
| Vào hồ sơ kỹ năng | Có | Có (đánh dấu nguồn "tự luyện") |

## 4. Vai trò và quyền

| Chức năng | HS | GV | Admin |
|---|:-:|:-:|:-:|
| Đăng ký, đăng nhập, hồ sơ cá nhân | ✔ | ✔ | ✔ |
| Làm bài thư viện tự luyện | ✔ | xem thử | xem thử |
| Làm bài được giao | ✔ | | |
| Xem hồ sơ kỹ năng, lộ trình của mình | ✔ | | |
| Tạo lớp, quản lý học sinh | | ✔ | ✔ |
| Tạo bài (tự soạn/AI) | | ✔ | ✔ |
| Giao bài + hạn nộp + nhắc hạn | | ✔ | |
| Chấm, sửa điểm và nhận xét AI | | ✔ (lớp mình) | ✔ |
| Xem phân tích học sinh/lớp | | ✔ (lớp mình) | ✔ (toàn hệ thống) |
| Quản lý thư viện chung | | đề xuất | ✔ |
| Quản lý tài khoản, duyệt giáo viên | | | ✔ |
| Cấu hình AI, thống kê, nhật ký | | | ✔ |

## 5. Học sinh

**Chức năng:** đăng ký/đăng nhập, tham gia lớp bằng **mã lớp**; làm bài được giao (xem hạn nộp, trạng thái chưa làm/đã nộp/trễ hạn); **tự luyện** trong thư viện (lọc theo kỹ năng, cấp độ, dạng bài, chủ đề; tìm kiếm) với chế độ **luyện tập** (xem đáp án và giải thích ngay) và **thi thử** (tính giờ); yêu thích, lịch sử, **làm lại câu sai**, **báo lỗi bài**; xem **hồ sơ kỹ năng** (biểu đồ 4 kỹ năng, mức ước lượng, loại lỗi, tiến bộ); xem **lộ trình cá nhân** và đánh dấu hoàn thành; nhận **nhắc hạn** (trong ứng dụng, thêm email nếu kịp). Mở rộng: chuỗi ngày học, huy hiệu, sổ từ vựng.

**Dạng bài theo kỹ năng:**

| Kỹ năng | Dạng bài | Chấm |
|---|---|---|
| Đọc | Trắc nghiệm đọc hiểu; đúng/sai/không có thông tin; tìm thông tin; đoán nghĩa từ | Tự động |
| Nghe | Nghe chọn đáp án; nghe điền từ; nghe hội thoại trả lời câu hỏi; chép chính tả | Tự động |
| Viết | Sửa câu sai; viết câu/đoạn theo chủ đề; viết email; mô tả biểu đồ/nghị luận ngắn | AI (sửa câu có thể tự động) |
| Nói | Đọc theo câu mẫu; trả lời câu hỏi ngắn; mô tả tranh/chủ đề; đóng vai | AI |
| Nền tảng | Từ vựng, ngữ pháp, flashcard | Tự động |

Nội dung Nghe: **AI viết kịch bản**, đọc bằng **text-to-speech** của trình duyệt (không cần thu âm thật).

**AI làm cho học sinh:**
- **Chấm Viết:** theo tiêu chí (nội dung, mạch lạc, từ vựng, ngữ pháp), đánh dấu lỗi trên văn bản, giải thích tiếng Việt, đưa bản sửa.
- **Chấm Nói:** ghi âm → speech-to-text → so với đề/câu mẫu; chấm nội dung, độ trôi chảy (tốc độ, ngắt nghỉ), phát âm **ở mức từ** (từ nào sai/thiếu).
- **Chấm Nghe, Đọc:** tự động theo đáp án; AI giải thích đúng/sai.
- **Cập nhật hồ sơ kỹ năng:** gom điểm và loại lỗi qua nhiều bài.
- **Lộ trình cá nhân:** kế hoạch theo tuần từ hồ sơ kỹ năng, mỗi mục trỏ tới bài có sẵn hoặc bài AI sinh mới; cập nhật khi tiến bộ.
- **Gợi ý bài tự luyện** ("Gợi ý cho bạn") theo điểm yếu.

## 6. Giáo viên

**Chức năng:** tài khoản **cần admin duyệt**; quản lý lớp (tạo, sinh mã lớp, thêm/xóa học sinh); **tạo bài 3 cách** (tự soạn bằng form theo dạng; nhập prompt cho AI sinh bản nháp gồm kỹ năng, cấp độ, chủ đề, dạng, số câu; lấy từ thư viện chung rồi sửa); **duyệt bản nháp AI** trước khi giao; **giao bài kèm hạn nộp** (ngày giờ) và **lịch nhắc** (vd trước 24 giờ, 1 giờ), đánh dấu đúng hạn/trễ; xem bài nộp, chấm, **sửa điểm và nhận xét AI** (được ghi đè); xem phân tích học sinh/lớp (gồm dữ liệu tự luyện); **đề xuất bài vào thư viện chung**.

**AI làm cho giáo viên:** sinh bài từ prompt (JSON đúng dạng, kèm đáp án và giải thích); gợi ý nhận xét Viết/Nói; phân tích từng học sinh (mạnh/yếu, xu hướng, mức tự luyện); phân tích cả lớp (lỗi phổ biến, học sinh tụt, kỹ năng yếu); đề xuất việc giao tiếp theo.

## 7. Admin

- **Tài khoản:** tạo, khóa/mở khóa, đặt lại mật khẩu, **duyệt giáo viên**, phân quyền. Quản lý lớp và danh mục (kỹ năng, cấp độ, chủ đề, thẻ).
- **Thư viện chung:** tạo bằng form, bằng **AI sinh hàng loạt**, hoặc nhập CSV/JSON; mọi bài AI sinh ở trạng thái **nháp** → admin sửa rồi xuất bản; sửa/ẩn/xóa/gắn thẻ; **duyệt đề xuất** của giáo viên; **xử lý báo lỗi**; **thống kê chất lượng bài** (bài nhiều người làm, tỷ lệ sai bất thường do đáp án sai hoặc đề mơ hồ).
- **Quản lý AI:** sửa mẫu prompt, đặt giới hạn lượt gọi mỗi người mỗi ngày, theo dõi lượng dùng và chi phí.
- **Thống kê hệ thống:** số người dùng, số bài làm, kỹ năng dùng nhiều, tỷ lệ nộp đúng hạn. **Nhật ký hoạt động** để truy vết.

## 8. Thư viện bài tập và dạng bài

| Nhóm | Dạng bài | Ghi chú |
|---|---|---|
| **Chấm tự động** (không tốn API) | Trắc nghiệm; đúng/sai; điền chỗ trống; nối cặp; sắp xếp từ thành câu; sắp xếp câu thành đoạn; chọn từ đúng; tìm và sửa lỗi; chép chính tả; flashcard | Phần lớn kho bài |
| **Chấm bằng AI** (tốn API, giới hạn lượt) | Viết câu/đoạn/email; đọc theo câu mẫu; trả lời nói theo chủ đề; mô tả tranh | Giới hạn lượt mỗi ngày |

**Mỗi dạng bài = một lược đồ JSON + một component hiển thị** (mẫu Registry); thêm dạng mới không phải sửa phần khác. Ví dụ:

```json
{ "type": "fill_blank", "skill": "reading", "level": "A2", "topic": "daily life",
  "content": { "text": "She ___ to school every day.", "hint": "go" },
  "answer": ["goes"],
  "explanation": "Chủ ngữ số ít ở thì hiện tại đơn thêm -es." }
```

## 9. AI: nguyên tắc và kiểm soát

- Dùng **API LLM** + speech-to-text + text-to-speech, **không huấn luyện mô hình**. Dịch vụ chọn: **Google Gemini API (gói miễn phí, model Flash)** sau lớp `AIProvider` để đổi được; tên model để trong `.env`.
- AI **trả JSON theo khuôn** (điểm theo tiêu chí, lỗi có vị trí, loại lỗi, bản sửa, nhận xét); backend **kiểm tra bằng Zod** trước khi lưu, sai thì thử lại 1 lần.
- **Điểm AI chỉ là ước lượng tham khảo**, giáo viên được sửa. Bài AI sinh luôn là **bản nháp**, phải có người duyệt.
- **Chi phí:** cache, giới hạn lượt theo người, ưu tiên chấm tự động, nhật ký gọi AI cho admin.
- **Riêng tư:** chỉ lưu bản chữ hóa của bài nói, **xóa file âm thanh sau xử lý**, không gửi thông tin định danh. Gói miễn phí của Gemini có thể dùng dữ liệu gửi lên để cải thiện sản phẩm → chỉ dùng dữ liệu mẫu, ghi rõ trong báo cáo.
- **Giới hạn chấm Nói:** dựa trên nhận dạng giọng nói + so khớp văn bản, chỉ đánh giá phát âm **mức từ**, không chấm âm vị.

## 10. Phạm vi

**TỐI THIỂU (bắt buộc):** 3 vai trò, đăng nhập, phân quyền, admin duyệt giáo viên; quản lý lớp và mã lớp; **6-8 dạng bài** gồm ít nhất trắc nghiệm (Đọc), điền từ, nối cặp hoặc sắp xếp câu, sửa lỗi, **Viết có AI chấm**, **Nói có AI chấm**, **Nghe điền từ**; thư viện tự luyện có lọc + chế độ luyện tập; admin tạo bài bằng form và AI (nháp → duyệt → xuất bản); giáo viên tạo bài (tự soạn, AI), giao bài có hạn nộp, xem bài nộp, sửa điểm; **hồ sơ kỹ năng** (điểm 4 kỹ năng, loại lỗi, biểu đồ tiến bộ); thống kê cơ bản cho giáo viên và admin; kiểm thử và đánh giá độ tin cậy điểm AI.

**MONG MUỐN (nếu đúng tiến độ):** lộ trình cá nhân do AI; nhắc hạn (trong ứng dụng, email); AI phân tích học sinh/lớp; "Gợi ý cho bạn"; thi thử có tính giờ; báo lỗi bài và thống kê chất lượng bài; dashboard đẹp hơn (radar, tiến bộ theo tuần).

**MỞ RỘNG (chỉ ghi báo cáo):** thêm dạng bài (sắp xếp đoạn, mô tả tranh, đóng vai bằng giọng nói); flashcard lặp lại ngắt quãng (SM-2) và sổ từ vựng tự động; chuỗi ngày học, huy hiệu, xếp hạng lớp; giáo viên đề xuất vào thư viện; nhập CSV/JSON hàng loạt; xuất báo cáo PDF; mô phỏng thi kiểu IELTS (chỉ tham khảo); học thích ứng nâng cao (tự chọn độ khó); extension, PWA.

**Nếu trễ, cắt theo thứ tự:** mở rộng → thi thử/gợi ý → nhắc email → lộ trình AI → bớt số dạng bài. **Không được cắt:** vòng lặp lõi (làm bài → chấm → hồ sơ kỹ năng), phân quyền 3 vai trò, thư viện tự luyện, giao bài có hạn nộp, đánh giá điểm AI.

## 11. Công nghệ (ĐÃ CHỐT)

| Phần | Chọn |
|---|---|
| Ngôn ngữ | **TypeScript** cho cả FE và BE (nhóm chưa vững ngôn ngữ nào nên dùng một ngôn ngữ) |
| Frontend | React + Vite + Tailwind CSS, React Router, TanStack Query, Recharts |
| Backend | Node.js + Express, Zod, JWT + bcrypt, multer, node-cron |
| ORM / CSDL | Prisma + PostgreSQL (Docker Compose) |
| AI | Gemini API (gói miễn phí) qua lớp `AIProvider`; Nói: ghi âm bằng MediaRecorder + chữ hóa bằng Gemini (dự phòng Web Speech API); Nghe: `speechSynthesis` |
| Nhắc hạn | node-cron + thông báo trong ứng dụng (email nếu kịp) |
| Khác | Git/GitHub, Postman, draw.io, Figma |

Chi tiết kiến trúc, cấu trúc thư mục, quy ước: xem `TECH_STACK_AND_STRUCTURE.md`.

## 12. Kiến trúc, CSDL, kế hoạch

**Kiến trúc:** `[React SPA] <-- REST/JSON + JWT --> [Express: Route → Controller → Service → Prisma] <--> [PostgreSQL]`; backend còn có bộ lập lịch nhắc hạn và lớp gọi AI (prompt, kiểm tra JSON, cache, giới hạn) nối tới Gemini.

**Bảng chính:** `users` (id, tên, email, mật khẩu băm, vai trò student/teacher/admin, trạng thái chờ duyệt/hoạt động/khóa); `classes`, `class_members`; `exercises` (kỹ năng, cấp độ, dạng, chủ đề, nội dung JSON, đáp án, trạng thái nháp/đã duyệt/ẩn, người tạo, nguồn admin/giáo viên/AI); `assignments` (bài, lớp, hạn nộp, lịch nhắc); `attempts` (học sinh, bài, `assignment_id` **trống nếu tự luyện**, câu trả lời, điểm, lỗi JSON, thời điểm); `skill_profiles` (học sinh, kỹ năng, điểm, mức ước lượng, thống kê lỗi JSON, cập nhật); `learning_paths`, `learning_path_items`; `notifications`; `exercise_reports`; `ai_usage_logs`; `prompt_templates`; `audit_logs`.

**Kế hoạch 5 sprint** (từ 29/10 đến 01/12; chi tiết và phân công trong `WORKS.md`):

| Sprint | Thời gian | Mục tiêu |
|---|---|---|
| 1 | 29/10 - 04/11 | Khung dự án, đăng nhập, phân quyền 3 vai trò, quản lý lớp |
| 2 | 05/11 - 11/11 | Kho bài + 4 dạng chấm tự động, thư viện tự luyện, giao bài có hạn nộp |
| 3 | 12/11 - 18/11 | AI sinh bài, AI chấm Viết, Nghe điền từ, hồ sơ kỹ năng + biểu đồ |
| 4 | 19/11 - 25/11 | AI chấm Nói, giáo viên sửa điểm, admin, đánh giá AI, **chốt tính năng** |
| 5 | 26/11 - 01/12 | Sửa lỗi, báo cáo ≥ 20 trang, slide tiếng Anh, video demo, nộp |

Báo cáo viết dần từng sprint, chụp ảnh màn hình sau mỗi chức năng.

**Phân công:** Người 1 = backend + AI (CSDL, API, xác thực, phân quyền, lớp AI, chấm Viết/Nói, hồ sơ kỹ năng, lộ trình, đánh giá AI). Người 2 = frontend (giao diện 3 vai trò, component dạng bài, thư viện, dashboard, ghi âm/phát âm thanh, nhắc hạn trên giao diện, Figma). Làm chung: thiết kế, nhập ≥ 60 bài mẫu, kiểm thử, báo cáo, slide, trả lời hội đồng.

## 13. Đánh giá thực nghiệm (cho báo cáo)

| Nội dung | Cách đo |
|---|---|
| Độ tin cậy điểm Viết của AI | 30-50 bài, chấm tay bởi giáo viên/người giỏi; so độ chênh trung bình, hệ số tương quan, tỷ lệ lệch > 1 mức |
| Độ tin cậy chấm Nói | So chữ hóa và từ bị đánh dấu sai với đánh giá tay trên 20-30 bản ghi |
| Chất lượng bài AI sinh | Tỷ lệ bài phải sửa trước khi dùng (50-100 bài) |
| Hiệu năng | Thời gian phản hồi chấm tự động và chấm AI |
| Kiểm thử chức năng | Bảng test case mỗi vai trò (mô tả, bước, kết quả mong đợi, thực tế) |
| Kiểm thử phân quyền | Học sinh không vào được chức năng giáo viên/admin; giáo viên chỉ thấy lớp mình |
| Thử nghiệm người dùng | 5-10 người dùng thử + khảo sát ngắn |

## 14. Mục lục báo cáo (≥ 20 trang)

1. Mở đầu (lý do, mục tiêu, phạm vi) 2. Khảo sát và cơ sở lý thuyết (nền tảng học tiếng Anh hiện có, CEFR, chấm bài bằng LLM, nhận dạng giọng nói, học thích ứng) 3. Phân tích và thiết kế (yêu cầu chức năng 3 vai trò, use case, kiến trúc, ERD, giao diện, lược đồ dạng bài) 4. Thiết kế phần AI (prompt, lược đồ JSON, kiểm soát chi phí, riêng tư) 5. Cài đặt (công nghệ, module, ảnh giao diện) 6. Kiểm thử và đánh giá (mục 13) 7. Kết luận và hướng phát triển 8. Tài liệu tham khảo, phụ lục

## 15. Rủi ro và cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Phạm vi lớn so với thời gian còn lại | Mỗi kỹ năng 1-2 dạng bài trước; kho bài + chấm tự động trước, AI sau; bám mức tối thiểu |
| Chưa có nền tảng AI | Chỉ gọi API với prompt và JSON |
| AI chấm sai/không ổn định | Ép JSON, kiểm tra định dạng, giáo viên sửa điểm, đo bằng chấm tay |
| AI sinh bài sai | Luôn là bản nháp, bắt buộc duyệt |
| Chi phí, giới hạn API miễn phí | Cache, giới hạn lượt, ưu tiên chấm tự động, xử lý lỗi 429 (thử lại sau) |
| Chấm Nói thiếu chính xác | Nói rõ giới hạn (mức từ), thử trên bản ghi mẫu |
| Quyền riêng tư | Xóa âm thanh sau xử lý, chỉ lưu chữ hóa, chỉ dùng dữ liệu mẫu |
| Sự cố khi bảo vệ (mạng, API) | Video demo, dữ liệu mẫu, kết quả AI lưu sẵn |
| Dồn báo cáo cuối kỳ | Viết dần theo từng sprint |

## 16. Đề nghị với trợ lý AI

Giải thích đơn giản vì nhóm chưa có nền tảng AI. Ưu tiên: (1) dựng khung dự án, đăng nhập, phân quyền, từng module theo sprint; (2) use case, ERD, kiến trúc, lược đồ JSON từng dạng bài; (3) prompt và lược đồ JSON cho các tác vụ AI (chấm Viết, chấm Nói, sinh bài, phân tích, lộ trình); (4) viết báo cáo, thiết kế đánh giá, slide tiếng Anh, câu hỏi dự kiến của hội đồng.

**Ràng buộc:** bám mức phạm vi mục 10, không đề xuất mở rộng vượt tiến độ, ưu tiên phương án đơn giản, chạy được trước.
