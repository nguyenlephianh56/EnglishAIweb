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

/** Chọn mẫu theo cờ đổi. Không đổi gì thì trả null (không có thông báo để tạo). */
export const buildTeacherEditMessage = ({
  scoreChanged,
  commentChanged,
  topic,
  className,
}: TeacherEditMessageInput): string | null => {
  let change: TeacherEditChange;
  if (scoreChanged && commentChanged) change = "both";
  else if (scoreChanged) change = "score";
  else if (commentChanged) change = "comment";
  else return null;

  return teacherEditMessageText({
    change,
    topic: cleanLabel(topic, REMINDER_LABELS.topic),
    className: cleanLabel(className, REMINDER_LABELS.className),
  });
};