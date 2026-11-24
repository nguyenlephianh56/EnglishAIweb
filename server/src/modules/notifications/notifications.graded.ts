import { cleanLabel } from "./notifications.reminder-rules";
import { gradedMessageText, REMINDER_LABELS } from "./notifications.constants";

interface GradedMessageInput {
  topic: string;
  className: string;
}

/** Dựng message `graded`. Làm sạch topic/tên lớp bằng đúng `cleanLabel` của nhắc hạn; không có điểm số hay nhận xét. */
export const buildGradedMessage = ({ topic, className }: GradedMessageInput): string =>
  gradedMessageText({
    topic: cleanLabel(topic, REMINDER_LABELS.topic),
    className: cleanLabel(className, REMINDER_LABELS.className),
  });