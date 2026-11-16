/**
 * Test tích hợp fetchSkillAttempts (lấy attempt của 1 HS thuộc 1 kỹ năng): DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env. Không gọi AI.
 * - Tự tạo user/bài/lớp/bài giao/attempt riêng, xóa sạch sau khi chạy.
 * - Tiền tố "t14sa_" riêng để không xóa nhầm dữ liệu test khác.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Prisma, Skill } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { fetchSkillAttempts, MAX_ATTEMPTS_READ } from "./skill-profiles.attempts";

const PREFIX = "t14sa_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const ids = { teacher: 0, studentA: 0, studentB: 0, classId: 0 };

const BASE_TIME = new Date("2026-01-01T00:00:00.000Z").getTime();
/** Mốc thời gian cố định: minute càng lớn càng mới. */
const at = (minute: number) => new Date(BASE_TIME + minute * 60_000);

const createUser = async (label: string, role: "TEACHER" | "STUDENT") => {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`,
      email: `${RUN_ID}_${label}@test.local`,
      passwordHash: "not-a-real-hash",
      role,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return user.id;
};

const newExercise = async (skill: Skill) => {
  const row = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill,
      level: "A1",
      topic: `${RUN_ID} topic`,
      content: { text: "She ___ to school." },
      answer: ["goes"],
      status: "PUBLISHED",
      source: "ADMIN",
      inLibrary: true,
      createdById: ids.teacher,
    },
    select: { id: true },
  });
  return row.id;
};

const newAssignment = async (exerciseId: number) => {
  const row = await prisma.assignment.create({
    data: {
      exerciseId,
      classId: ids.classId,
      assignedById: ids.teacher,
      dueAt: at(10_000),
    },
    select: { id: true },
  });
  return row.id;
};

const newAttempt = async (opts: {
  studentId: number;
  exerciseId: number;
  assignmentId?: number | null;
  score?: number | null;
  teacherScore?: number | null;
  errors?: unknown;
  minute: number;
}) => {
  const row = await prisma.attempt.create({
    data: {
      studentId: opts.studentId,
      exerciseId: opts.exerciseId,
      assignmentId: opts.assignmentId ?? null,
      answer: ["goes"],
      score: opts.score ?? null,
      teacherScore: opts.teacherScore ?? null,
      errors: (opts.errors ?? [{ type: "vocab" }]) as Prisma.InputJsonValue,
      submittedAt: at(opts.minute),
    },
    select: { id: true },
  });
  return row.id;
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  // Thứ tự theo khóa ngoại: attempt -> bài giao -> lớp -> bài -> user (skill_profiles tự cascade theo user).
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.assignment.deleteMany({ where: { assignedById: { in: userIds } } });
  await prisma.class.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;

  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((user) => user.id));

  ids.teacher = await createUser("teacher", "TEACHER");
  ids.studentA = await createUser("student_a", "STUDENT");
  ids.studentB = await createUser("student_b", "STUDENT");

  const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
  const cls = await prisma.class.create({
    data: { name: `${RUN_ID} class`, code, teacherId: ids.teacher },
    select: { id: true },
  });
  ids.classId = cls.id;
});

afterAll(async () => {
  await cleanup([ids.teacher, ids.studentA, ids.studentB].filter((id) => id > 0));
  await prisma.$disconnect();
});

describe("fetchSkillAttempts", () => {
  it("hằng số giới hạn đọc là 300", () => {
    expect(MAX_ATTEMPTS_READ).toBe(300);
  });

  it("HS chưa có attempt nào -> []", async () => {
    const rows = await fetchSkillAttempts(prisma, ids.studentB, "LISTENING");
    // studentB chưa tạo attempt LISTENING ở thời điểm này
    expect(rows).toEqual([]);
  });

  it("chỉ lấy attempt của đúng HS và đúng kỹ năng (FOUNDATION tách riêng)", async () => {
    const reading = await newExercise("READING");
    const foundation = await newExercise("FOUNDATION");
    const writing = await newExercise("WRITING");

    const a1 = await newAttempt({ studentId: ids.studentA, exerciseId: reading, score: 7, minute: 1 });
    await newAttempt({ studentId: ids.studentA, exerciseId: foundation, score: 5, minute: 2 });
    await newAttempt({ studentId: ids.studentA, exerciseId: writing, score: 6, minute: 3 });
    await newAttempt({ studentId: ids.studentB, exerciseId: reading, score: 9, minute: 4 });

    const readingRows = await fetchSkillAttempts(prisma, ids.studentA, "READING");
    expect(readingRows.map((r) => r.id)).toEqual([a1]);

    const foundationRows = await fetchSkillAttempts(prisma, ids.studentA, "FOUNDATION");
    expect(foundationRows).toHaveLength(1);
    expect(foundationRows[0].exerciseId).toBe(foundation);

    const bRows = await fetchSkillAttempts(prisma, ids.studentB, "READING");
    expect(bRows).toHaveLength(1);
    expect(bRows[0].score).toBe(9);
  });

  it("chỉ trả đúng các trường cần dùng (không lộ answer, aiFeedback...)", async () => {
    const speaking = await newExercise("SPEAKING");
    const assignmentId = await newAssignment(speaking);
    await newAttempt({
      studentId: ids.studentA,
      exerciseId: speaking,
      assignmentId,
      score: 6.5,
      teacherScore: 8,
      errors: [{ type: "pronunciation", text: "x" }],
      minute: 5,
    });

    const rows = await fetchSkillAttempts(prisma, ids.studentA, "SPEAKING");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["assignmentId", "errors", "exerciseId", "id", "score", "submittedAt", "teacherScore"].sort()
    );
    expect(rows[0].assignmentId).toBe(assignmentId);
    expect(rows[0].score).toBe(6.5);
    expect(rows[0].teacherScore).toBe(8);
    expect(rows[0].submittedAt).toBeInstanceOf(Date);
    expect(rows[0].errors).toEqual([{ type: "pronunciation", text: "x" }]);
  });

  it("vẫn trả attempt chưa chấm (score NULL) và bài tự luyện có assignmentId NULL", async () => {
    const listening = await newExercise("LISTENING");
    const idUngraded = await newAttempt({
      studentId: ids.studentA,
      exerciseId: listening,
      score: null,
      minute: 6,
    });

    const rows = await fetchSkillAttempts(prisma, ids.studentA, "LISTENING");
    expect(rows.map((r) => r.id)).toEqual([idUngraded]);
    expect(rows[0].score).toBeNull();
    expect(rows[0].assignmentId).toBeNull();
  });

  it("sắp gần nhất trước; cùng submittedAt thì id lớn trước", async () => {
    // Dùng READING của studentB (đã có 1 attempt ở minute 4).
    const ex = await newExercise("READING");
    const older = await newAttempt({ studentId: ids.studentB, exerciseId: ex, score: 1, minute: 20 });
    const tieFirst = await newAttempt({ studentId: ids.studentB, exerciseId: ex, score: 2, minute: 30 });
    const tieSecond = await newAttempt({ studentId: ids.studentB, exerciseId: ex, score: 3, minute: 30 });

    const rows = await fetchSkillAttempts(prisma, ids.studentB, "READING");
    const order = rows.map((r) => r.id);
    expect(order.slice(0, 3)).toEqual([tieSecond, tieFirst, older]);
  });

  it("limit cắt đúng số attempt GẦN NHẤT", async () => {
    const rows3 = await fetchSkillAttempts(prisma, ids.studentB, "READING", 3);
    expect(rows3).toHaveLength(3);

    const rows1 = await fetchSkillAttempts(prisma, ids.studentB, "READING", 1);
    expect(rows1).toHaveLength(1);
    // Attempt mới nhất của studentB/READING là lần có score 3 (minute 30, id lớn nhất).
    expect(rows1[0].score).toBe(3);
  });

  it("limit không hợp lệ -> RangeError", async () => {
    await expect(fetchSkillAttempts(prisma, ids.studentA, "READING", 0)).rejects.toThrow(RangeError);
    await expect(fetchSkillAttempts(prisma, ids.studentA, "READING", -1)).rejects.toThrow(RangeError);
    await expect(fetchSkillAttempts(prisma, ids.studentA, "READING", 1.5)).rejects.toThrow(RangeError);
    await expect(fetchSkillAttempts(prisma, ids.studentA, "READING", Number.NaN)).rejects.toThrow(
      RangeError
    );
  });

  it("chạy được bên trong transaction client", async () => {
    const rows = await prisma.$transaction((tx) => fetchSkillAttempts(tx, ids.studentB, "READING"));
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });
});