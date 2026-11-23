import { cleanLabel } from "./notifications.reminder-rules";
import {
  REMINDER_LABELS,
  teacherEditMessageText,
  type TeacherEditChange,
} from "./notifications.constants";

interface TeacherEditMessageInput {
  scoreChanged: boolean;
  commentChanged: boolean;
  topic: string;
  className: string;
}

/** Chọn mẫu theo cờ đổi và gộp cờ của dòng chưa đọc nếu nhận diện được mẫu cũ. */
export const buildTeacherEditMessage = (
  { scoreChanged, commentChanged, topic, className }: TeacherEditMessageInput,
  previousMessage?: string
): string | null => {
  if (!scoreChanged && !commentChanged) return null;

  const labels = {
    topic: cleanLabel(topic, REMINDER_LABELS.topic),
    className: cleanLabel(className, REMINDER_LABELS.className),
  };
  if (previousMessage !== undefined) {
    const previousChange = (["score", "comment", "both"] as const).find(
      (change) => teacherEditMessageText({ change, ...labels }) === previousMessage
    );
    scoreChanged ||= previousChange === "score" || previousChange === "both";
    commentChanged ||= previousChange === "comment" || previousChange === "both";
  }

  let change: TeacherEditChange = scoreChanged ? "score" : "comment";
  if (scoreChanged && commentChanged) change = "both";
  return teacherEditMessageText({ change, ...labels });
};