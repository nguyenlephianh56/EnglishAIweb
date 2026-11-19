/**
 * Dạng bài CHƯA cho giao.
 * writing đã mở lại ở T13 (nộp bài lưu chờ chấm); speaking mở lại ở T18 (nộp bằng audio_id/transcript,
 * chấm AI). Hiện mọi dạng đều giao được: giữ hằng số này (rỗng) làm chỗ để chặn lại khi cần,
 * muốn chặn một dạng thì thêm tên dạng bài vào danh sách, không cần sửa chỗ khác.
 */
export const NON_ASSIGNABLE_TYPES: readonly string[] = [];
/** remindBeforeHours: tối đa bao nhiêu mốc nhắc, và mỗi mốc tối đa bao nhiêu giờ (7 ngày). */
export const MAX_REMIND_ITEMS = 5;
export const MAX_REMIND_HOURS = 168;

/** Trạng thái của một bài giao đối với MỘT học sinh. */
export const ASSIGNMENT_STATUSES = ["NOT_STARTED", "SUBMITTED", "OVERDUE"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** GET /assignments: số dòng mỗi trang (mặc định) và giới hạn tối đa client được xin. */
export const ASSIGNMENT_LIST_DEFAULT_LIMIT = 20;
export const ASSIGNMENT_LIST_MAX_LIMIT = 50;