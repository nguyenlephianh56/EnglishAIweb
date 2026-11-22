import { ExerciseStatus, Prisma, Role, UserStatus } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { MAX_REMIND_HOURS } from "../assignments/assignments.constants";
import {
  deadlineNotificationKey,
  REMINDER_HOUR_MS,
  REMINDER_SCAN_FAILED,
} from "./notifications.constants";
import { buildDeadlineMessage, computeDueMark } from "./notifications.reminder-rules";

const reminderScheduleSelect = {
  dueAt: true,
  createdAt: true,
  remindBeforeH: true,
} satisfies Prisma.AssignmentSelect;

type ReminderScheduleRow = Prisma.AssignmentGetPayload<{ select: typeof reminderScheduleSelect }>;

const getDueMark = ({ dueAt, createdAt, remindBeforeH }: ReminderScheduleRow, now: Date) =>
  computeDueMark({ dueAt, createdAt, remindBeforeHours: remindBeforeH }, now);

// ReadCommitted để truy vấn sau khi chờ khóa thấy dữ liệu lượt trước đã commit.
const createAssignmentReminders = (
  assignmentId: number,
  candidateFilter: Prisma.AssignmentWhereInput,
  now: Date
) => prisma.$transaction(async (tx) => {
  // PostgreSQL tách không gian khóa của một bigint khỏi cặp (studentId, số tuần) của T24.
  // T25 dùng assignmentId âm làm khóa riêng cho mỗi bài giao, tự nhả khi transaction kết thúc.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${-assignmentId}::bigint)`;

  const assignment = await tx.assignment.findFirst({
    where: { ...candidateFilter, id: assignmentId },
    select: {
      ...reminderScheduleSelect,
      classId: true,
      class: { select: { name: true } },
      exercise: { select: { topic: true } },
    },
  });
  if (!assignment) return 0;

  const mark = getDueMark(assignment, now);
  if (mark === null) return 0;

  const message = buildDeadlineMessage({
    now,
    dueAt: assignment.dueAt,
    timeZone: env.APP_TIMEZONE,
    topic: assignment.exercise.topic,
    className: assignment.class.name,
  });
  if (message === null) return 0;

  const members = await tx.classMember.findMany({
    where: {
      classId: assignment.classId,
      student: {
        role: Role.STUDENT,
        status: UserStatus.ACTIVE,
        attempts: { none: { assignmentId } },
      },
    },
    select: { studentId: true },
  });
  if (members.length === 0) return 0;

  const type = deadlineNotificationKey(assignmentId, mark);
  const existing = await tx.notification.findMany({
    where: { type, userId: { in: members.map(({ studentId }) => studentId) } },
    select: { userId: true },
  });
  const alreadyNotified = new Set(existing.map(({ userId }) => userId));
  const data = members
    .filter(({ studentId }) => !alreadyNotified.has(studentId))
    .map(({ studentId }) => ({ userId: studentId, type, message }));

  if (data.length === 0) return 0;
  const { count } = await tx.notification.createMany({ data });
  return count;
}, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

export const runReminderScan = async ({ now }: { now: Date }) => {
  const candidateFilter: Prisma.AssignmentWhereInput = {
    dueAt: { gt: now, lte: new Date(now.getTime() + MAX_REMIND_HOURS * REMINDER_HOUR_MS) },
    remindBeforeH: { isEmpty: false },
    exercise: { status: { not: ExerciseStatus.HIDDEN } },
  };
  const candidates = await prisma.assignment.findMany({
    where: candidateFilter,
    select: { id: true, ...reminderScheduleSelect },
    orderBy: { id: "asc" },
  });

  const result = { scanned: candidates.length, created: 0, failed: 0 };
  for (const candidate of candidates) {
    try {
      if (getDueMark(candidate, now) === null) continue;
      result.created += await createAssignmentReminders(candidate.id, candidateFilter, now);
    } catch {
      result.failed += 1;
      console.error(REMINDER_SCAN_FAILED);
    }
  }
  return result;
};