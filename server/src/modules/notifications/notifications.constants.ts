export const NOTIFICATION_LIST_DEFAULT_LIMIT = 20;
export const NOTIFICATION_LIST_MAX_LIMIT = 50;
export const MAX_INT4 = 2_147_483_647;

export const DEADLINE_NOTIFICATION_TYPE = "deadline";
export const DEADLINE_NOTIFICATION_KEY_PATTERN = new RegExp(
  `^${DEADLINE_NOTIFICATION_TYPE}:([1-9]\\d*):[1-9]\\d*$`
);
export const deadlineNotificationKey = (assignmentId: number, hours: number) =>
  `${DEADLINE_NOTIFICATION_TYPE}:${assignmentId}:${hours}`;
export const REMINDER_SCAN_FAILED = "REMINDER_SCAN_FAILED";

export const REMINDER_MINUTE_MS = 60_000;
export const REMINDER_HOUR_MS = 60 * REMINDER_MINUTE_MS;
export const REMINDER_DAY_MS = 24 * REMINDER_HOUR_MS;
export const REMINDER_DAY_THRESHOLD_MS = 2 * REMINDER_DAY_MS;

export const REMINDER_TIME_UNITS = { minute: "phút", hour: "giờ", day: "ngày" } as const;
export const REMINDER_LABELS = {
  topic: { maxChars: 80, fallback: "Không có tiêu đề" },
  className: { maxChars: 60, fallback: "chưa đặt tên" },
} as const;
export const REMINDER_EMAIL_PATTERN = /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}.-]{1,253}\.[\p{L}]{2,63}/gu;

export const REMINDER_DATE_LOCALE = "vi-VN";
export const REMINDER_DATE_OPTIONS = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
} satisfies Intl.DateTimeFormatOptions;

export const deadlineMessageText = ({
  topic,
  className,
  dueLabel,
  remaining,
}: {
  topic: string;
  className: string;
  dueLabel: string;
  remaining: string;
}) => `Bài giao «${topic}» của lớp ${className} sắp đến hạn nộp (${dueLabel}), còn khoảng ${remaining}.`;

// T28 · `teacher_edit`: GV/ADMIN sửa THẬT điểm hoặc nhận xét của bài nộp đã có điểm -> thông báo cho HS.
// Khóa nằm trong `type` (cùng cách T25, không đổi schema): `teacher_edit:<attemptId>`.
export const TEACHER_EDIT_NOTIFICATION_TYPE = "teacher_edit";
export const TEACHER_EDIT_NOTIFICATION_KEY_PATTERN = new RegExp(
  `^${TEACHER_EDIT_NOTIFICATION_TYPE}:[1-9]\\d*$`
);
export const teacherEditNotificationKey = (attemptId: number) =>
  `${TEACHER_EDIT_NOTIFICATION_TYPE}:${attemptId}`;
export const TEACHER_EDIT_NOTIFY_FAILED = "TEACHER_EDIT_NOTIFY_FAILED";

export type TeacherEditChange = "score" | "comment" | "both";

// Không đưa điểm số, nhận xét, tên GV, email vào message.
export const teacherEditMessageText = ({
  change,
  topic,
  className,
}: {
  change: TeacherEditChange;
  topic: string;
  className: string;
}) => {
  const what = { score: "điểm", comment: "nhận xét", both: "điểm và nhận xét" }[change];
  return `Giáo viên đã cập nhật ${what} bài «${topic}» của lớp ${className}.`;
};

// T28 · `graded`: GV/ADMIN chấm tay LẦN ĐẦU cho bài nộp chưa có điểm cuối (`finalScoreOf` từ null thành có điểm) -> thông báo cho HS.
// Khóa nằm trong `type` (cùng cách T25, không đổi schema): `graded:<attemptId>`.
export const GRADED_NOTIFICATION_TYPE = "graded";
export const GRADED_NOTIFICATION_KEY_PATTERN = new RegExp(
  `^${GRADED_NOTIFICATION_TYPE}:[1-9]\\d*$`
);
export const gradedNotificationKey = (attemptId: number) =>
  `${GRADED_NOTIFICATION_TYPE}:${attemptId}`;
export const GRADED_NOTIFY_FAILED = "GRADED_NOTIFY_FAILED";

// Không đưa điểm số, nhận xét, tên GV, email vào message.
export const gradedMessageText = ({
  topic,
  className,
}: {
  topic: string;
  className: string;
}) => `Giáo viên đã chấm bài «${topic}» của lớp ${className}.`;