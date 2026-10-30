# Prompt Figma cho dự án

## Cách dùng

Figma AI (Figma Make / First Draft) làm tốt hơn khi nhận **từng phần nhỏ**, vì vậy prompt được chia thành 4 phần. Làm theo thứ tự:

1. Dán **Prompt 1** (hệ thống thiết kế) và để Figma tạo bảng màu, chữ, component.
2. Dán **Prompt 2, 3, 4** lần lượt (Học sinh, Giáo viên, Admin) trong **cùng file** để giữ đồng bộ phong cách.
3. Sau mỗi lần, kiểm tra và chỉnh tay, rồi nhờ Figma "dùng đúng Design System ở trên".

Prompt viết bằng tiếng Anh vì Figma AI hiểu tốt hơn, còn **chữ hiển thị trên giao diện giữ tiếng Việt** (đã ghi sẵn trong prompt).

## Bảng màu đã chọn

| Vai trò | Màu | Mã | Dùng cho |
|---|---|---|---|
| **Chủ đạo** | Indigo | `#4F46E5` | Nút chính, liên kết, mục đang chọn. Lý do: gợi sự tin cậy, học tập, công nghệ AI; tương phản tốt trên nền trắng |
| Chủ đạo đậm | Indigo 700 | `#4338CA` | Hover, nhấn mạnh |
| Chủ đạo nhạt | Indigo 50 | `#EEF2FF` | Nền mục đang chọn, nền thẻ nhấn |
| **Phụ 1** | Teal | `#14B8A6` | Nút phụ, thanh tiến độ, điểm nhấn tích cực |
| **Phụ 2 (nhấn)** | Amber | `#F59E0B` | Sao, chuỗi ngày học, cảnh báo nhẹ, "gợi ý cho bạn" |
| Thành công | Green | `#22C55E` | Đáp án đúng, nộp đúng hạn |
| Lỗi | Red | `#EF4444` | Đáp án sai, trễ hạn, đánh dấu lỗi |
| Thông tin | Sky | `#0EA5E9` | Thông báo, nhãn thông tin |
| Chữ chính | Slate 900 | `#0F172A` | Tiêu đề, nội dung |
| Chữ phụ | Slate 600 | `#475569` | Mô tả, nhãn |
| Viền | Slate 200 | `#E2E8F0` | Đường viền, đường kẻ |
| Nền trang | Slate 50 | `#F8FAFC` | Nền chung |
| Nền thẻ | White | `#FFFFFF` | Card, modal |

**Màu theo kỹ năng** (dùng nhất quán ở biểu đồ, nhãn, icon để nhìn là biết kỹ năng nào):

| Kỹ năng | Màu | Mã |
|---|---|---|
| Nghe (Listening) | Violet | `#8B5CF6` |
| Nói (Speaking) | Orange | `#F97316` |
| Đọc (Reading) | Sky | `#0EA5E9` |
| Viết (Writing) | Pink | `#EC4899` |
| Nền tảng (từ vựng, ngữ pháp) | Slate | `#64748B` |

Font: **Plus Jakarta Sans** cho tiêu đề, **Inter** cho nội dung (cả hai hỗ trợ tiếng Việt có dấu).

Các mã màu trùng với bảng màu mặc định của Tailwind CSS (indigo-600, teal-500, amber-500...), nên khi code Người 2 dùng thẳng class Tailwind.

---

## PROMPT 1: Hệ thống thiết kế

```
Create a complete design system and UI kit for a web app called "EnglishAI", an adaptive English-skills learning platform (Listening, Speaking, Reading, Writing) with AI-based grading and weakness analysis. Three user roles: Student, Teacher, Admin. The target users are Vietnamese university/high-school students and teachers. All visible UI text must be in VIETNAMESE (with full diacritics). Style: clean, modern, friendly but professional, lots of white space, soft shadows, rounded corners. Similar spirit to Duolingo's clarity and Notion's cleanliness, but calmer and more academic.

COLOR TOKENS
- Primary: Indigo #4F46E5 (hover #4338CA, light #EEF2FF, mid #C7D2FE)
- Secondary: Teal #14B8A6
- Accent: Amber #F59E0B
- Success #22C55E, Error #EF4444, Info #0EA5E9
- Text: #0F172A (primary), #475569 (secondary), #94A3B8 (disabled)
- Border #E2E8F0, page background #F8FAFC, card background #FFFFFF
- Skill colors (use consistently for badges, icons, chart series): Listening/Nghe Violet #8B5CF6, Speaking/Nói Orange #F97316, Reading/Đọc Sky #0EA5E9, Writing/Viết Pink #EC4899, Foundation/Nền tảng Slate #64748B
- CEFR level badges A1, A2, B1, B2: from light to deeper tints of Teal (A1 lightest, B2 darkest)
- Also create a dark-mode variant of the tokens.

TYPOGRAPHY
- Headings: Plus Jakarta Sans (H1 32/40 bold, H2 24/32 bold, H3 20/28 semibold, H4 16/24 semibold)
- Body: Inter (16/24 regular, 14/20 regular, caption 12/16 medium)
- Make sure Vietnamese diacritics render correctly.

LAYOUT
- Grid: 12 columns, 1440px desktop, 768px tablet, 390px mobile. Spacing scale 4/8/12/16/24/32/48.
- Radius: 8px inputs and buttons, 16px cards, 24px modals. Shadows: soft, low opacity.

COMPONENTS (create as Figma components with variants and states: default, hover, focus, disabled, loading)
- Buttons: primary, secondary (teal), outline, ghost, danger; sizes S/M/L; with optional icon.
- Inputs: text, password (show/hide), textarea, select, multi-select, search, date-time picker, file upload, checkbox, radio, toggle, OTP-free class-code input (6 characters).
- Navigation: left sidebar (collapsible, 3 role variants), top bar with search, notification bell with badge, user avatar menu; breadcrumbs; tabs; pagination.
- Data display: card, stat card (number + trend), table with sort/filter/row actions, badge/tag (status: Nháp, Chờ duyệt, Đã xuất bản, Ẩn; assignment: Chưa làm, Đã nộp, Trễ hạn), progress bar, circular progress, avatar, tooltip, empty state, skeleton loading, toast, alert banner, modal, drawer, dropdown menu, accordion, stepper.
- Charts (use skill colors): radar chart for 4 skills, line chart for progress over time, bar chart for error types, donut chart, heat-map for class errors.
- Exercise-specific components: multiple-choice option card (states: unselected, selected, correct, wrong), fill-in-the-blank inline input, matching pairs (two columns with connecting lines), word-ordering chips (drag), text-with-highlighted-errors (error underlined in red wavy, tooltip with explanation and correction), audio player (play, replay, speed, progress), audio recorder (idle, recording with live waveform and timer, review, uploading), word-level pronunciation result (each word colored green/amber/red), timer countdown, AI-feedback card (criteria scores + comments), "AI estimated score - for reference only" disclaimer chip.
- Icons: simple outline icon set (Lucide style).

Deliver: a styles page (colors, type, spacing), a components page with all variants, and a small sample screen to prove consistency.
```

---

## PROMPT 2: Giao diện Học sinh

```
Using the EnglishAI design system above, design the STUDENT role screens, desktop 1440px first, plus mobile 390px versions of the starred (*) screens. All text in Vietnamese. Left sidebar menu: Trang chủ, Bài được giao, Thư viện luyện tập, Hồ sơ kỹ năng, Lộ trình học, Từ vựng, Thông báo, Tài khoản.

1. Login & Register (shared by all roles) *: split layout, left = illustration + tagline "Học tiếng Anh theo đúng trình độ của bạn", right = form. Register has a role selector (Học sinh / Giáo viên) with a note "Tài khoản giáo viên cần quản trị viên duyệt". Also: "Đang chờ duyệt" waiting screen for teachers.

2. Student Dashboard (Trang chủ) *: greeting + streak (amber), "Bài sắp đến hạn" list with countdown and status badges, mini radar chart of 4 skills, "Gợi ý cho bạn" (3 exercise cards chosen from weakest skills, amber "Gợi ý" tag), "Lộ trình tuần này" progress card, button "Tham gia lớp" opening a modal with a 6-character class-code input.

3. Assigned Exercises (Bài được giao): tabs Tất cả / Chưa làm / Đã nộp / Trễ hạn; each row shows title, skill badge, class, due date-time, status badge, button "Làm bài" or "Xem kết quả".

4. Practice Library (Thư viện luyện tập) *: search bar; filters on the left (Kỹ năng, Cấp độ A1-B2, Dạng bài, Chủ đề); card grid, each card has skill-colored icon, title, level badge, exercise type, number of questions, estimated minutes, heart (favorite) icon, and "Bạn đã làm n lần". Tabs: Tất cả / Yêu thích / Lịch sử / Làm lại câu sai.

5. Exercise Detail (before start): description, mode choice with two big cards: "Luyện tập" (xem đáp án ngay) and "Thi thử" (có tính giờ), button "Bắt đầu", link "Báo lỗi bài này".

6. Exercise Runner (one screen design per type, same frame: top progress bar + question counter, optional timer, main area, bottom bar with "Bỏ qua" and "Kiểm tra / Tiếp tục"):
   a. Reading multiple choice: passage on the left, questions on the right.
   b. Fill in the blank: sentence with inline inputs and a hint chip.
   c. Matching: two columns.
   d. Error correction: sentence with a wrong part to select and retype.
   e. Listening fill-in: audio player (play/replay/speed) + transcript hidden, blanks to fill.
   f. Writing: prompt card, large text editor with word counter, button "Nộp bài để AI chấm", remaining AI turns indicator ("Còn 4 lượt hôm nay").
   g. Speaking: prompt/sample sentence, big round record button (idle / recording with waveform + timer / review with playback), "Nộp bài".
   Practice mode shows an instant feedback panel (correct = green, wrong = red + explanation in Vietnamese).

7. Result screen *: score ring, time, per-question review list; for Writing show the text with red-underlined errors, a side panel with criteria scores (Nội dung, Mạch lạc, Từ vựng, Ngữ pháp), error list (loại lỗi, câu sai, câu sửa, giải thích), AI comment, and the chip "Điểm AI chỉ mang tính tham khảo"; if the teacher edited the score show "Giáo viên đã chỉnh sửa". For Speaking show the transcript with each word colored (đúng / đọc chưa rõ / thiếu), fluency metrics (tốc độ, số lần ngắt nghỉ) and a replay button. Buttons: "Làm lại", "Bài tiếp theo".

8. Skill Profile (Hồ sơ kỹ năng) *: large radar chart (4 skills in skill colors), 4 skill cards each with score, CEFR level badge and trend arrow, line chart of progress over time with a skill filter, bar chart "Loại lỗi hay mắc" (thì, mạo từ, giới từ, từ vựng, phát âm), and an "Điểm yếu cần cải thiện" list with button "Luyện ngay".

9. Learning Path (Lộ trình học): weekly timeline, each item is a checkable card (title, linked exercise, skill badge, estimated time), progress bar, button "Tạo lại lộ trình".

10. Notifications: list with icons (nhắc hạn, đã có kết quả chấm, giáo viên đã chỉnh điểm), unread state, mark all as read.

11. Account page: avatar, name, email, change password.

Include: loading skeletons, empty states (e.g. "Bạn chưa có bài được giao"), error state for AI failure ("Hệ thống AI đang bận, vui lòng thử lại sau") and AI limit reached state ("Bạn đã dùng hết lượt chấm AI hôm nay").
Add a clickable prototype linking: Login → Dashboard → Library → Exercise → Result → Skill Profile.
```

---

## PROMPT 3: Giao diện Giáo viên

```
Using the same EnglishAI design system, design the TEACHER role screens, desktop 1440px first (star = also make mobile 390px). All text in Vietnamese. Sidebar menu: Tổng quan, Lớp học, Ngân hàng bài tập, Bài đã giao, Chấm bài, Phân tích, Đề xuất thư viện, Thông báo, Tài khoản.

1. Teacher Dashboard *: stat cards (số lớp, số học sinh, bài chờ chấm, bài sắp đến hạn), chart "Tỷ lệ nộp đúng hạn", list "Bài cần chấm", list "Học sinh cần chú ý" (red flag for dropping scores).

2. Classes: grid of class cards (name, code with copy button, number of students); button "Tạo lớp" opening a modal.

3. Class Detail: header with class name + code; tabs Học sinh / Bài đã giao / Phân tích lớp. Students table (name, email, last active, 4 mini skill bars, level) with actions "Xem hồ sơ", "Xóa khỏi lớp"; button "Thêm học sinh".

4. Create Exercise: step 1 choose method as 3 large cards: "Tự soạn" / "Nhờ AI tạo" / "Lấy từ thư viện chung"; step 2 form that changes by exercise type (skill, level, type, topic, content, answers, explanation) with live preview on the right.

5. AI Generate Exercise: form (Kỹ năng, Cấp độ, Dạng bài, Chủ đề, Số câu, Yêu cầu thêm as free text prompt) and button "Tạo bản nháp bằng AI"; a loading state; then the Draft Review screen: list of generated questions as editable cards (edit question, options, correct answer, explanation), per-question delete/regenerate, yellow banner "Bài do AI tạo là bản nháp, hãy kiểm tra kỹ trước khi giao", buttons "Lưu nháp" and "Duyệt và lưu vào ngân hàng".

6. Assign Exercise (modal or page): choose exercise, choose class, due date-time picker, reminder options as checkboxes (Nhắc trước 24 giờ, Nhắc trước 1 giờ), button "Giao bài".

7. Assigned List: table (bài, lớp, hạn nộp, đã nộp x/y, trễ hạn) with progress bars.

8. Submissions of one assignment *: table (học sinh, thời gian nộp, đúng hạn/trễ hạn, điểm, trạng thái chấm).

9. Grading screen (Writing and Speaking variants), two-column layout: left = student's work (Writing: text with highlighted errors; Speaking: audio-less transcript with colored words + fluency metrics), right = AI feedback card (criteria scores, error list, AI comment) with editable score fields, a comment box prefilled with "Gợi ý nhận xét từ AI" (editable), buttons "Dùng điểm AI", "Lưu điểm chỉnh sửa", and a small history showing "Điểm AI: 7.0 → Giáo viên: 7.5".

10. Student Analysis: student header, radar chart, progress line chart, error-type bar chart, "Mức độ tự luyện" card (số bài tự luyện, số ngày hoạt động), and an "AI phân tích" card with strengths, weaknesses, trend and recommended next tasks (amber accent), button "Giao bài đề xuất".

11. Class Analysis: heat-map of common error types by skill, ranking "Học sinh đang tụt", skill averages bar chart, AI card "Lỗi phổ biến của lớp" and "Nên giao tiếp theo".

12. Propose to Library: pick own exercise → submit to admin, status list (Chờ duyệt / Đã duyệt / Từ chối).

Include empty states, loading skeletons, and the AI-busy/AI-limit error states.
```

---

## PROMPT 4: Giao diện Admin

```
Using the same EnglishAI design system, design the ADMIN role screens, desktop 1440px (admin is desktop-first, no mobile needed). All text in Vietnamese. Sidebar menu: Tổng quan, Tài khoản, Lớp học, Thư viện bài tập, Duyệt đề xuất, Báo lỗi, Cấu hình AI, Thống kê, Nhật ký.

1. Admin Dashboard: stat cards (số người dùng, số bài làm, số lượt gọi AI hôm nay, giáo viên chờ duyệt), line chart "Lượt làm bài theo ngày", donut "Kỹ năng được dùng nhiều", bar "Tỷ lệ nộp đúng hạn", quick list "Giáo viên chờ duyệt" with Duyệt/Từ chối buttons.

2. Accounts: table with search and filters (vai trò, trạng thái), badges (Hoạt động, Chờ duyệt, Khóa), row actions (Khóa/Mở khóa, Đặt lại mật khẩu, Đổi vai trò); button "Tạo tài khoản"; a dedicated tab "Chờ duyệt giáo viên".

3. Classes & Categories: manage classes; manage categories (kỹ năng, cấp độ, chủ đề, thẻ) with inline add/edit.

4. Exercise Library: table with filters (kỹ năng, cấp độ, dạng, trạng thái Nháp/Đã xuất bản/Ẩn, nguồn Admin/Giáo viên/AI), bulk select, actions (Sửa, Ẩn, Xóa, Gắn thẻ), three create buttons: "Tạo bằng form", "Tạo hàng loạt bằng AI", "Nhập từ file CSV/JSON". Column "Tỷ lệ sai" with a red flag when abnormally high (likely wrong answer or ambiguous question).

5. Bulk AI Generate: form (kỹ năng, cấp độ, dạng, chủ đề, số lượng 1-30), result list of drafts with checkboxes, per-item quick edit, button "Xuất bản các bài đã chọn".

6. Review Teacher Proposals: list with preview drawer and buttons Duyệt / Từ chối + lý do.

7. Exercise Reports (Báo lỗi): table (bài, người báo, lý do, trạng thái Mới/Đang xử lý/Đã xử lý), detail drawer with the exercise preview and buttons "Sửa bài", "Ẩn bài", "Bỏ qua".

8. AI Configuration: tabs "Mẫu prompt" (list of templates for chấm Viết, chấm Nói, sinh bài, phân tích, lộ trình; code-like editor with variables highlighted, version note, button Lưu), "Giới hạn" (số lượt gọi AI mỗi người mỗi ngày, per role), "Sử dụng" (line chart of calls per day, table by task type and user, estimated cost, error rate).

9. System Statistics: filters by date range; charts for users, attempts, skills usage, on-time submission rate; export button.

10. Audit Log: table (thời gian, người dùng, hành động, đối tượng, chi tiết) with filters and search.

Include empty states, confirmation modals for destructive actions (Khóa tài khoản, Xóa bài), and toast notifications.
```

---

## Gợi ý khi dùng

- Nếu Figma AI tạo ra quá nhiều màn hình cùng lúc và bị rối, tách nhỏ hơn: mỗi lần chỉ dán 3-4 mục đánh số.
- Màn hình **ưu tiên làm trước** (đủ để lập trình và demo): Đăng nhập, Dashboard học sinh, Thư viện, các màn làm bài (đặc biệt Viết, Nói), Kết quả, Hồ sơ kỹ năng, Chấm bài của giáo viên, Duyệt bản nháp AI, Quản lý tài khoản của admin.
- Thiết kế giúp báo cáo (chương 3, mục thiết kế giao diện): xuất ảnh các màn hình này đưa vào báo cáo.
