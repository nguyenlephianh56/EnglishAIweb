-- =====================================================================
-- Mo ta bang va cot (COMMENT). pgAdmin hien thi cac mo ta nay trong tab
-- Properties/Comment cua tung bang, cot. Sinh tu dong tu DATABASE.md.
-- =====================================================================

COMMENT ON TABLE users IS 'Người dùng. Tài khoản của cả 3 vai trò. Giáo viên đăng ký xong ở trạng thái PENDING cho đến khi admin duyệt.';
COMMENT ON COLUMN users.id IS 'Mã người dùng, tự tăng';
COMMENT ON COLUMN users.name IS 'Họ tên hiển thị';
COMMENT ON COLUMN users.email IS 'Email đăng nhập, duy nhất, luôn viết thường';
COMMENT ON COLUMN users.password_hash IS 'Mật khẩu đã băm bằng bcrypt. Không bao giờ lưu mật khẩu gốc';
COMMENT ON COLUMN users.role IS 'Vai trò';
COMMENT ON COLUMN users.status IS 'Trạng thái tài khoản';
COMMENT ON COLUMN users.created_at IS 'Thời điểm tạo tài khoản';

COMMENT ON TABLE classes IS 'Lớp học. Lớp do một giáo viên tạo. Học sinh tham gia bằng mã lớp.';
COMMENT ON COLUMN classes.id IS 'Mã lớp, tự tăng';
COMMENT ON COLUMN classes.name IS 'Tên lớp';
COMMENT ON COLUMN classes.code IS 'Mã lớp để học sinh nhập khi tham gia: 6 ký tự chữ HOA hoặc số, duy nhất';
COMMENT ON COLUMN classes.teacher_id IS 'Giáo viên phụ trách (users.id có role TEACHER)';
COMMENT ON COLUMN classes.created_at IS 'Thời điểm tạo lớp';

COMMENT ON TABLE class_members IS 'Thành viên lớp. Bảng nối nhiều-nhiều giữa lớp và học sinh. Mỗi học sinh chỉ xuất hiện một lần trong mỗi lớp.';
COMMENT ON COLUMN class_members.class_id IS 'Lớp (classes.id). Xóa lớp thì dòng này tự xóa';
COMMENT ON COLUMN class_members.student_id IS 'Học sinh (users.id có role STUDENT). Xóa người dùng thì dòng này tự xóa';
COMMENT ON COLUMN class_members.joined_at IS 'Thời điểm vào lớp';

COMMENT ON TABLE exercises IS 'Bài tập. Toàn bộ bài tập: bài trong thư viện chung, bài riêng của giáo viên và bản nháp do AI sinh. Cấu trúc content và answer phụ thuộc vào type (xem mục 5).';
COMMENT ON COLUMN exercises.id IS 'Mã bài tập, tự tăng';
COMMENT ON COLUMN exercises.type IS 'Dạng bài. Quyết định cấu trúc của content và answer';
COMMENT ON COLUMN exercises.skill IS 'Kỹ năng';
COMMENT ON COLUMN exercises.level IS 'Cấp độ CEFR';
COMMENT ON COLUMN exercises.topic IS 'Chủ đề của bài';
COMMENT ON COLUMN exercises.content IS 'Nội dung đề bài, là một JSON object';
COMMENT ON COLUMN exercises.answer IS 'Đáp án để chấm tự động (JSON). NULL với bài Viết và Nói';
COMMENT ON COLUMN exercises.explanation IS 'Giải thích hiển thị sau khi học sinh làm';
COMMENT ON COLUMN exercises.status IS 'Trạng thái bài';
COMMENT ON COLUMN exercises.source IS 'Nguồn tạo bài';
COMMENT ON COLUMN exercises.in_library IS 'true = thuộc thư viện chung cho mọi học sinh tự luyện';
COMMENT ON COLUMN exercises.created_by_id IS 'Người tạo (users.id)';
COMMENT ON COLUMN exercises.created_at IS 'Thời điểm tạo';
COMMENT ON COLUMN exercises.updated_at IS 'Lần sửa gần nhất (trigger tự cập nhật)';

COMMENT ON TABLE assignments IS 'Bài được giao. Giáo viên giao một bài cho một lớp, kèm hạn nộp và lịch nhắc. Mỗi học sinh trong lớp đều nhận được bài này.';
COMMENT ON COLUMN assignments.id IS 'Mã lượt giao, tự tăng';
COMMENT ON COLUMN assignments.exercise_id IS 'Bài được giao (exercises.id)';
COMMENT ON COLUMN assignments.class_id IS 'Lớp nhận bài (classes.id). Xóa lớp thì lượt giao tự xóa';
COMMENT ON COLUMN assignments.assigned_by_id IS 'Giáo viên giao bài (users.id)';
COMMENT ON COLUMN assignments.due_at IS 'Hạn nộp (có múi giờ)';
COMMENT ON COLUMN assignments.remind_before_hours IS 'Nhắc trước hạn bao nhiêu giờ. Là mảng, mỗi giá trị phải > 0';
COMMENT ON COLUMN assignments.created_at IS 'Thời điểm giao';

COMMENT ON TABLE attempts IS 'Bài làm. Mỗi lần học sinh nộp một bài. Đây là bảng lớn nhất và là nguồn dữ liệu để tính hồ sơ kỹ năng và mọi thống kê.';
COMMENT ON COLUMN attempts.id IS 'Mã bài làm, tự tăng';
COMMENT ON COLUMN attempts.student_id IS 'Học sinh làm bài (users.id)';
COMMENT ON COLUMN attempts.exercise_id IS 'Bài đã làm (exercises.id)';
COMMENT ON COLUMN attempts.assignment_id IS 'Thuộc lượt giao nào. NULL nghĩa là học sinh tự luyện';
COMMENT ON COLUMN attempts.mode IS 'Chế độ làm bài';
COMMENT ON COLUMN attempts.answer IS 'Câu trả lời của học sinh (JSON)';
COMMENT ON COLUMN attempts.score IS 'Điểm thang 10 do hệ thống tự chấm hoặc AI chấm';
COMMENT ON COLUMN attempts.max_score IS 'Điểm tối đa';
COMMENT ON COLUMN attempts.errors IS 'Danh sách lỗi phát hiện được (JSON mảng)';
COMMENT ON COLUMN attempts.ai_feedback IS 'Phản hồi của AI đã qua kiểm tra Zod. NULL nếu bài chấm tự động';
COMMENT ON COLUMN attempts.teacher_score IS 'Điểm giáo viên sửa. Nếu có thì ưu tiên hơn score';
COMMENT ON COLUMN attempts.teacher_comment IS 'Nhận xét của giáo viên';
COMMENT ON COLUMN attempts.is_late IS 'true nếu nộp sau hạn';
COMMENT ON COLUMN attempts.submitted_at IS 'Thời điểm nộp bài';

COMMENT ON TABLE skill_profiles IS 'Hồ sơ kỹ năng. Mỗi học sinh có tối đa 5 dòng (mỗi kỹ năng một dòng). Đây là trung tâm của tính năng thích ứng: gợi ý bài, lộ trình và phân tích đều đọc từ đây.';
COMMENT ON COLUMN skill_profiles.id IS 'Mã dòng, tự tăng';
COMMENT ON COLUMN skill_profiles.student_id IS 'Học sinh (users.id). Xóa người dùng thì hồ sơ tự xóa';
COMMENT ON COLUMN skill_profiles.skill IS 'Kỹ năng';
COMMENT ON COLUMN skill_profiles.score IS 'Điểm trung bình trượt của kỹ năng, từ 0 đến 10';
COMMENT ON COLUMN skill_profiles.level IS 'Mức ước lượng. NULL nếu chưa đủ dữ liệu';
COMMENT ON COLUMN skill_profiles.error_stats IS 'Đếm số lần mắc từng loại lỗi (JSON object)';
COMMENT ON COLUMN skill_profiles.updated_at IS 'Lần cập nhật gần nhất';

COMMENT ON TABLE learning_paths IS 'Lộ trình học. Lộ trình học theo tuần do AI tạo cho một học sinh. Mỗi tuần một dòng.';
COMMENT ON COLUMN learning_paths.id IS 'Mã lộ trình, tự tăng';
COMMENT ON COLUMN learning_paths.student_id IS 'Học sinh (users.id). Xóa người dùng thì lộ trình tự xóa';
COMMENT ON COLUMN learning_paths.week_start IS 'Ngày đầu tuần của lộ trình';
COMMENT ON COLUMN learning_paths.created_at IS 'Thời điểm tạo';

COMMENT ON TABLE learning_path_items IS 'Mục trong lộ trình. Từng việc cần làm trong một lộ trình, có thể gắn với một bài tập có sẵn.';
COMMENT ON COLUMN learning_path_items.id IS 'Mã mục, tự tăng';
COMMENT ON COLUMN learning_path_items.path_id IS 'Lộ trình chứa mục này (learning_paths.id). Xóa lộ trình thì mục tự xóa';
COMMENT ON COLUMN learning_path_items.title IS 'Việc cần làm';
COMMENT ON COLUMN learning_path_items.exercise_id IS 'Bài tập gắn kèm. NULL nếu không có hoặc bài đã bị xóa';
COMMENT ON COLUMN learning_path_items.done IS 'Học sinh đã hoàn thành chưa';

COMMENT ON TABLE notifications IS 'Thông báo. Thông báo trong ứng dụng (chuông thông báo).';
COMMENT ON COLUMN notifications.id IS 'Mã thông báo, tự tăng';
COMMENT ON COLUMN notifications.user_id IS 'Người nhận (users.id). Xóa người dùng thì thông báo tự xóa';
COMMENT ON COLUMN notifications.type IS 'Loại thông báo';
COMMENT ON COLUMN notifications.message IS 'Nội dung hiển thị';
COMMENT ON COLUMN notifications.read_at IS 'Thời điểm đã đọc. NULL nghĩa là chưa đọc';
COMMENT ON COLUMN notifications.created_at IS 'Thời điểm tạo';

COMMENT ON TABLE exercise_reports IS 'Báo lỗi bài. Người dùng báo bài có lỗi (đáp án sai, đề mơ hồ) để admin xử lý.';
COMMENT ON COLUMN exercise_reports.id IS 'Mã báo lỗi, tự tăng';
COMMENT ON COLUMN exercise_reports.exercise_id IS 'Bài bị báo lỗi (exercises.id). Xóa bài thì báo lỗi tự xóa';
COMMENT ON COLUMN exercise_reports.reporter_id IS 'Người báo (users.id)';
COMMENT ON COLUMN exercise_reports.reason IS 'Lý do';
COMMENT ON COLUMN exercise_reports.status IS 'Tiến trình xử lý';
COMMENT ON COLUMN exercise_reports.created_at IS 'Thời điểm báo';

COMMENT ON TABLE ai_usage_logs IS 'Nhật ký gọi AI. Ghi lại mỗi lần gọi AI để giới hạn lượt dùng mỗi ngày và thống kê chi phí.';
COMMENT ON COLUMN ai_usage_logs.id IS 'Mã bản ghi, tự tăng';
COMMENT ON COLUMN ai_usage_logs.user_id IS 'Người gọi AI (users.id)';
COMMENT ON COLUMN ai_usage_logs.task IS 'Tác vụ AI';
COMMENT ON COLUMN ai_usage_logs.status IS 'Kết quả của lần gọi';
COMMENT ON COLUMN ai_usage_logs.tokens IS 'Số token tiêu thụ. NULL nếu không có hoặc lấy từ cache';
COMMENT ON COLUMN ai_usage_logs.created_at IS 'Thời điểm gọi';

COMMENT ON TABLE prompt_templates IS 'Mẫu prompt. Mẫu prompt gửi cho AI ở từng tác vụ. Admin có thể chỉnh sửa trên giao diện mà không cần sửa code.';
COMMENT ON COLUMN prompt_templates.id IS 'Mã mẫu, tự tăng';
COMMENT ON COLUMN prompt_templates.key IS 'Tên tác vụ, duy nhất';
COMMENT ON COLUMN prompt_templates.template IS 'Nội dung prompt, có chứa biến';
COMMENT ON COLUMN prompt_templates.updated_at IS 'Lần sửa gần nhất';

COMMENT ON TABLE audit_logs IS 'Nhật ký hoạt động. Ghi lại các hành động quan trọng của admin/giáo viên để truy vết.';
COMMENT ON COLUMN audit_logs.id IS 'Mã bản ghi, tự tăng';
COMMENT ON COLUMN audit_logs.user_id IS 'Người thực hiện. NULL nếu người dùng đó đã bị xóa';
COMMENT ON COLUMN audit_logs.action IS 'Hành động';
COMMENT ON COLUMN audit_logs.detail IS 'Chi tiết hành động (JSON)';
COMMENT ON COLUMN audit_logs.created_at IS 'Thời điểm thực hiện';