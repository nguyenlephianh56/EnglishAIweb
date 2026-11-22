import { MAX_REMIND_HOURS } from "../assignments/assignments.constants";
import { sanitizeOneLine } from "../learning-paths/learning-paths.ai-text";
import {
  deadlineMessageText,
  REMINDER_DATE_LOCALE,
  REMINDER_DATE_OPTIONS,
  REMINDER_DAY_MS,
  REMINDER_DAY_THRESHOLD_MS,
  REMINDER_EMAIL_PATTERN,
  REMINDER_HOUR_MS,
  REMINDER_LABELS,
  REMINDER_MINUTE_MS,
  REMINDER_TIME_UNITS,
} from "./notifications.constants";

interface ReminderSchedule {
  dueAt: Date;
  createdAt: Date;
  remindBeforeHours: readonly number[];
}

export const computeDueMark = (
  { dueAt, createdAt, remindBeforeHours }: ReminderSchedule,
  now: Date
): number | null => {
  const dueTime = dueAt.getTime();
  const createdTime = createdAt.getTime();
  const nowTime = now.getTime();
  if (nowTime >= dueTime) return null;

  let mark: number | null = null;
  for (const hours of remindBeforeHours) {
    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_REMIND_HOURS) continue;

    const triggerTime = dueTime - hours * REMINDER_HOUR_MS;
    if (createdTime <= triggerTime && triggerTime <= nowTime && (mark === null || hours < mark)) {
      mark = hours;
    }
  }
  return mark;
};

export const formatRemaining = (ms: number): string | null => {
  if (!Number.isFinite(ms) || ms <= 0) return null;

  if (ms < REMINDER_HOUR_MS) {
    const minutes = Math.max(1, Math.ceil(ms / REMINDER_MINUTE_MS));
    return `${minutes} ${REMINDER_TIME_UNITS.minute}`;
  }
  if (ms < REMINDER_DAY_THRESHOLD_MS) {
    return `${Math.floor(ms / REMINDER_HOUR_MS)} ${REMINDER_TIME_UNITS.hour}`;
  }
  return `${Math.floor(ms / REMINDER_DAY_MS)} ${REMINDER_TIME_UNITS.day}`;
};

const cleanLabel = (text: string, { maxChars, fallback }: { maxChars: number; fallback: string }) =>
  sanitizeOneLine(text.replace(REMINDER_EMAIL_PATTERN, " "), maxChars) || fallback;

interface DeadlineMessageInput {
  dueAt: Date;
  now: Date;
  timeZone: string;
  topic: string;
  className: string;
}

export const buildDeadlineMessage = ({
  dueAt,
  now,
  timeZone,
  topic,
  className,
}: DeadlineMessageInput): string | null => {
  const remaining = formatRemaining(dueAt.getTime() - now.getTime());
  if (remaining === null) return null;

  const formatter = new Intl.DateTimeFormat(REMINDER_DATE_LOCALE, { ...REMINDER_DATE_OPTIONS, timeZone });
  const parts = Object.fromEntries(formatter.formatToParts(dueAt).map(({ type, value }) => [type, value]));
  const dueLabel = `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;

  return deadlineMessageText({
    topic: cleanLabel(topic, REMINDER_LABELS.topic),
    className: cleanLabel(className, REMINDER_LABELS.className),
    dueLabel,
    remaining,
  });
};