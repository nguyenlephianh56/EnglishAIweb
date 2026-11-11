/**
 * Dạng bài CHƯA cho giao (chấm AI làm ở Sprint 3-4).
 * Muốn mở lại: xóa tên dạng bài khỏi danh sách này, không cần sửa chỗ khác.
 */
export const NON_ASSIGNABLE_TYPES: readonly string[] = ["writing", "speaking"];

/** remindBeforeHours: tối đa bao nhiêu mốc nhắc, và mỗi mốc tối đa bao nhiêu giờ (7 ngày). */
export const MAX_REMIND_ITEMS = 5;
export const MAX_REMIND_HOURS = 168;

/** Trạng thái của một bài giao đối với MỘT học sinh. */
export const ASSIGNMENT_STATUSES = ["NOT_STARTED", "SUBMITTED", "OVERDUE"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** GET /assignments: số dòng mỗi trang (mặc định) và giới hạn tối đa client được xin. */
export const ASSIGNMENT_LIST_DEFAULT_LIMIT = 20;
export const ASSIGNMENT_LIST_MAX_LIMIT = 50;