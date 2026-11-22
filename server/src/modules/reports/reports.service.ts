import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { studentVisibleAssignmentWhere } from "../assignments/assignments.service";
import { canViewExercise } from "../exercises/exercises.service";
import { canTransitionReportStatus } from "./reports.rules";
import type { CreateReportBody, ListReportsQuery, UpdateReportBody } from "./reports.schema";

type ReportActor = Parameters<typeof canViewExercise>[0];

const reportSelect = {
  id: true,
  status: true,
  reason: true,
  createdAt: true,
  exercise: { select: { id: true, type: true, skill: true, level: true, topic: true, status: true } },
  reporter: { select: { id: true, name: true } },
} satisfies Prisma.ExerciseReportSelect;

type ReportRow = Prisma.ExerciseReportGetPayload<{ select: typeof reportSelect }>;

function toReportItem({ id, status, reason, createdAt, exercise, reporter }: ReportRow) {
  return { id, status, reason, created_at: createdAt, exercise, reporter };
}

export class ReportError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
  }
}

const exerciseNotFound = () => new ReportError(404, "NOT_FOUND", "Không tìm thấy bài tập");

export async function createReport(actor: ReportActor, { exercise_id: exerciseId, reason }: CreateReportBody) {
  if (actor.role !== Role.STUDENT || actor.status !== UserStatus.ACTIVE) {
    throw new ReportError(403, "FORBIDDEN", "Bạn không có quyền truy cập chức năng này");
  }

  return prisma.$transaction(async (tx) => {
    // ID học sinh âm để khóa này khác khóa nộp bài, vốn dùng hai ID dương.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${-actor.id}::int, ${exerciseId}::int)`;

    const exercise = await tx.exercise.findUnique({
      where: { id: exerciseId },
      select: { createdById: true, status: true, inLibrary: true },
    });
    if (!exercise) throw exerciseNotFound();

    if (!canViewExercise(actor, exercise)) {
      const assignment = await tx.assignment.findFirst({
        where: { ...studentVisibleAssignmentWhere(actor.id), exerciseId },
        select: { id: true },
      });
      if (!assignment) throw exerciseNotFound();
    }

    const existing = await tx.exerciseReport.findFirst({
      where: { exerciseId, reporterId: actor.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { id: true },
    });
    if (existing) throw new ReportError(409, "REPORT_ALREADY_OPEN", "Bạn đã có báo lỗi đang mở cho bài tập này");

    const row = await tx.exerciseReport.create({
      data: { exerciseId, reporterId: actor.id, reason, status: "OPEN" },
      select: reportSelect,
    });
    return toReportItem(row);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function listReports({ status, exercise_id: exerciseId, limit, cursor }: ListReportsQuery) {
  const where: Prisma.ExerciseReportWhereInput = { status, exerciseId };

  if (cursor !== undefined) {
    const anchor = await prisma.exerciseReport.findUnique({
      where: { id: cursor },
      select: { id: true, createdAt: true },
    });
    if (!anchor) return { items: [], next_cursor: null };

    where.OR = [
      { createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ];
  }

  const rows = await prisma.exerciseReport.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: reportSelect,
  });
  const items = rows.slice(0, limit).map(toReportItem);
  return { items, next_cursor: rows.length > limit ? items[limit - 1].id : null };
}

export async function updateReport(adminId: number, reportId: number, { status }: UpdateReportBody) {
  const invalidTransition = () =>
    new ReportError(409, "INVALID_STATUS_TRANSITION", "Không thể chuyển báo lỗi sang trạng thái này");

  return prisma.$transaction(async (tx) => {
    const before = await tx.exerciseReport.findUnique({
      where: { id: reportId },
      select: { status: true, exerciseId: true },
    });
    if (!before) throw new ReportError(404, "NOT_FOUND", "Không tìm thấy báo lỗi");
    if (!canTransitionReportStatus(before.status, status)) throw invalidTransition();

    const changed = await tx.exerciseReport.updateMany({
      where: { id: reportId, status: before.status },
      data: { status },
    });
    if (changed.count !== 1) throw invalidTransition();

    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: "report.update",
        detail: { report_id: reportId, exercise_id: before.exerciseId, from: before.status, to: status },
      },
    });

    const row = await tx.exerciseReport.findUniqueOrThrow({ where: { id: reportId }, select: reportSelect });
    return toReportItem(row);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}