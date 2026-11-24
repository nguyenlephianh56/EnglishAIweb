import { randomUUID } from "node:crypto";
import { Role, UserStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { hasUserRelatedData } from "./admin.users-delete.related-data";

const rollbackFixture = new Error("Rollback dữ liệu thử của T29");

async function withFixture(run: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      await run(tx);
      throw rollbackFixture;
    });
  } catch (error) {
    if (error !== rollbackFixture) throw error;
  }
}

function createUser(tx: Prisma.TransactionClient, role: Role, status: UserStatus = UserStatus.ACTIVE) {
  return tx.user.create({
    data: {
      name: "T29 dữ liệu thử",
      email: `t29-delete-${randomUUID()}@example.test`,
      passwordHash: "not-a-real-hash",
      role,
      status,
    },
    select: { id: true },
  });
}

function createClass(tx: Prisma.TransactionClient, teacherId: number) {
  return tx.class.create({
    data: {
      name: "Lớp thử T29",
      code: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(),
      teacherId,
    },
    select: { id: true },
  });
}

function createExercise(tx: Prisma.TransactionClient, createdById: number) {
  return tx.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: "Bài thử T29",
      content: { text: "She ___ to school." },
      answer: ["goes"],
      source: "TEACHER",
      createdById,
    },
    select: { id: true },
  });
}

type HistoryCase = {
  relation: string;
  role?: Role;
  insert: (fixture: {
    tx: Prisma.TransactionClient;
    userId: number;
    classId: number;
    exerciseId: number;
  }) => Promise<unknown>;
};

const historyCases: HistoryCase[] = [
  {
    relation: "classes.teacher_id",
    role: Role.TEACHER,
    insert: ({ tx, userId }) => createClass(tx, userId),
  },
  {
    relation: "class_members.student_id",
    insert: ({ tx, userId, classId }) => tx.classMember.create({ data: { classId, studentId: userId } }),
  },
  {
    relation: "exercises.created_by_id",
    role: Role.TEACHER,
    insert: ({ tx, userId }) => createExercise(tx, userId),
  },
  {
    relation: "assignments.assigned_by_id",
    role: Role.TEACHER,
    insert: ({ tx, userId, classId, exerciseId }) => tx.assignment.create({
      data: {
        classId,
        exerciseId,
        assignedById: userId,
        dueAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    }),
  },
  {
    relation: "attempts.student_id",
    insert: ({ tx, userId, exerciseId }) => tx.attempt.create({
      data: { studentId: userId, exerciseId, answer: ["goes"] },
    }),
  },
  {
    relation: "skill_profiles.student_id",
    insert: ({ tx, userId }) => tx.skillProfile.create({
      data: { studentId: userId, skill: "FOUNDATION", score: 6 },
    }),
  },
  {
    relation: "learning_paths.student_id",
    insert: ({ tx, userId }) => tx.learningPath.create({
      data: { studentId: userId, weekStart: new Date("2026-11-23T00:00:00.000Z") },
    }),
  },
  {
    relation: "notifications.user_id",
    insert: ({ tx, userId }) => tx.notification.create({
      data: { userId, type: "system", message: "Thông báo thử T29" },
    }),
  },
  {
    relation: "exercise_reports.reporter_id",
    insert: ({ tx, userId, exerciseId }) => tx.exerciseReport.create({
      data: { reporterId: userId, exerciseId, reason: "Báo lỗi thử T29" },
    }),
  },
  {
    relation: "ai_usage_logs.user_id",
    insert: ({ tx, userId }) => tx.aiUsageLog.create({ data: { userId, task: "analysis", status: "ok" } }),
  },
  {
    relation: "audit_logs.user_id",
    insert: ({ tx, userId }) => tx.auditLog.create({ data: { userId, action: "t29.test" } }),
  },
];

describe("hasUserRelatedData trên PostgreSQL", () => {
  it("trả false cho giáo viên đang chờ duyệt và học sinh mới chưa có dòng liên quan", async () => {
    await withFixture(async (tx) => {
      const teacher = await createUser(tx, Role.TEACHER, UserStatus.PENDING);
      const student = await createUser(tx, Role.STUDENT);
      await tx.auditLog.create({
        data: { action: "t29.test", detail: { target_user_id: student.id } },
      });

      expect(await hasUserRelatedData(tx, teacher.id)).toBe(false);
      expect(await hasUserRelatedData(tx, student.id)).toBe(false);
    });
  });

  it.each(historyCases)("trả true khi chỉ có dòng ở $relation", async ({ role = Role.STUDENT, insert }) => {
    await withFixture(async (tx) => {
      const target = await createUser(tx, role);
      const otherTeacher = await createUser(tx, Role.TEACHER);
      const otherClass = await createClass(tx, otherTeacher.id);
      const otherExercise = await createExercise(tx, otherTeacher.id);

      expect(await hasUserRelatedData(tx, target.id)).toBe(false);
      await insert({ tx, userId: target.id, classId: otherClass.id, exerciseId: otherExercise.id });
      expect(await hasUserRelatedData(tx, target.id)).toBe(true);
    });
  });
});