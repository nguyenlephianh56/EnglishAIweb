import type { AppNotification, BackendNotification, NotificationType } from "../../../types/notification";

/** Đích khi bấm vào thông báo, tùy vai trò: nhận assignment_id và attempt_id (có thể null) và trả đường dẫn. */
export type NotificationTarget = (ids: { assignmentId: number | null; attemptId: number | null }) => string;

/** Loại backend -> loại giao diện + tiêu đề. Loại lạ rơi về GENERAL "Thông báo". */
const KNOWN: Record<string, { type: NotificationType; title: string }> = {
  deadline: { type: "DEADLINE", title: "Sắp đến hạn nộp bài" },
  graded: { type: "RESULT", title: "Bài của bạn đã được chấm" },
  teacher_edit: { type: "RESULT", title: "Giáo viên đã cập nhật bài của bạn" },
};
const FALLBACK = { type: "GENERAL" as const, title: "Thông báo" };

export function mapNotification(n: BackendNotification, buildTo: NotificationTarget): AppNotification {
  const kind = KNOWN[n.type] ?? FALLBACK;
  return {
    id: n.id,
    type: kind.type,
    title: kind.title,
    description: n.message,
    createdAt: n.created_at,
    read: n.read,
    to: buildTo({ assignmentId: n.assignment_id, attemptId: n.attempt_id ?? null }),
  };
}
