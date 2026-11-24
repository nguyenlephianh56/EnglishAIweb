/** T30 – GET /api/v1/attempts/:id/review.
 *  Phần 1: hàm thuần (không DB). Phần 2: PostgreSQL thật, gọi app qua server cổng ngẫu nhiên.
 *  Tiền tố t30_ riêng; chỉ dọn dữ liệu của lần chạy này. Không gọi AI.
 */
import { Prisma, Role, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../app";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import {
  buildAttemptReview,
  gradingStatusOf,
  type AttemptReviewRow,
} from "./attempts.review.service";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const ATTEMPT_KEYS = [
  "ai_feedback", "answer", "errors", "final_score", "grading_status", "id", "is_late",
  "max_score", "mode", "score", "submitted_at", "teacher_comment", "teacher_score",
];
const STUDENT_KEYS = ["id", "name"];
const EXERCISE_KEYS = ["answer", "content", "explanation", "id", "level", "skill", "topic", "type"];
const ASSIGNMENT_KEYS = ["class", "due_at", "id"];
const CLASS_KEYS = ["id", "name"];
const TOP_KEYS = ["assignment", "attempt", "exercise", "student"];
const sorted = (value: object) => Object.keys(value).sort();

// ---------------------------------------------------------------------
// Phần 1 – hàm thuần
// ---------------------------------------------------------------------
const fakeRow = (
  attempt: Partial<AttemptReviewRow> = {},
  exerciseType = "writing",
): AttemptReviewRow => ({
  id: 1,
  mode: "exam",
  answer: { text: "Hello." },
  submittedAt: new Date("2026-11-01T00:00:00.000Z"),
  isLate: false,
  score: 6.5,
  maxScore: 10,
  teacherScore: null,
  teacherComment: null,
  aiFeedback: null,
  errors: [],
  student: { id: 2, name: "HS" },
  exercise: {
    id: 3, type: exerciseType, skill: "WRITING", level: "A1", topic: "t",
    content: { prompt: "p" }, answer: null, explanation: "giải thích",
  },
  assignment: {
    id: 4, dueAt: new Date("2026-11-02T00:00:00.000Z"), class: { id: 5, name: "Lớp" },
  },
  ...attempt,
});

describe("T30 – buildAttemptReview (thuần)", () => {
  it("đúng tập key, không field thừa", () => {
    const result = buildAttemptReview(fakeRow());
    expect(sorted(result)).toEqual(TOP_KEYS);
    expect(sorted(result.attempt)).toEqual(ATTEMPT_KEYS);
    expect(sorted(result.student)).toEqual(STUDENT_KEYS);
    expect(sorted(result.exercise)).toEqual(EXERCISE_KEYS);
    expect(sorted(result.assignment!)).toEqual(ASSIGNMENT_KEYS);
    expect(sorted(result.assignment!.class)).toEqual(CLASS_KEYS);
  });

  it("final_score = teacher_score ghi đè, kể cả thấp hơn score và kể cả 0", () => {
    expect(buildAttemptReview(fakeRow({ score: 8, teacherScore: 5 })).attempt.final_score).toBe(5);
    expect(buildAttemptReview(fakeRow({ score: 8, teacherScore: 0 })).attempt.final_score).toBe(0);
    expect(buildAttemptReview(fakeRow({ score: 8, teacherScore: null })).attempt.final_score).toBe(8);
  });

  it("chưa có điểm nào: score và final_score đều null", () => {
    const { attempt } = buildAttemptReview(fakeRow({ score: null }));
    expect(attempt.score).toBeNull();
    expect(attempt.final_score).toBeNull();
  });

  it("làm tròn 2 chữ số", () => {
    const { attempt } = buildAttemptReview(fakeRow({ score: 6.666, teacherScore: null }));
    expect(attempt.score).toBe(6.67);
    expect(attempt.final_score).toBe(6.67);
  });

  it.each([
    [null, "writing", "PENDING"],
    [null, "speaking", "PENDING"],
    [0, "writing", "GRADED"],
    [7, "speaking", "GRADED"],
    [null, "multiple_choice", "GRADED"],
    [10, "multiple_choice", "GRADED"],
  ])("gradingStatusOf(score=%j, type=%s) = %s", (score, type, expected) => {
    expect(gradingStatusOf(score, type)).toBe(expected);
  });
});

// ---------------------------------------------------------------------
// Phần 2 – route + PostgreSQL thật
// ---------------------------------------------------------------------
describe("T30 – GET /api/v1/attempts/:id/review", () => {
  const prefix = `t30_${randomUUID().replaceAll("-", "")}`;
  const users: Record<string, number> = {};
  const attempts: Record<string, number> = {};
  const exerciseIds: Record<string, number> = {};
  let classAId = 0;
  let classBId = 0;
  let assignmentWritingId = 0;
  let server: Server | undefined;
  let baseUrl = "";

  const MISSING_ID = 2147483647;
  const NOT_FOUND = { data: null, error: { code: "NOT_FOUND", message: "Không tìm thấy bài nộp" } };

  const request = (id: number | string, user?: string) =>
    fetch(`${baseUrl}/api/v1/attempts/${id}/review`, {
      headers: user
        ? { Authorization: `Bearer ${jwt.sign({ userId: users[user] }, env.JWT_SECRET)}` }
        : {},
    });

  const ownedIds = () => Object.values(users);
  const attemptSnapshot = async () =>
    JSON.stringify(
      await prisma.attempt.findMany({ where: { studentId: users.student }, orderBy: { id: "asc" } }),
    );
  const sideEffectCounts = async () => ({
    audit: await prisma.auditLog.count({ where: { userId: { in: ownedIds() } } }),
    notification: await prisma.notification.count({ where: { userId: { in: ownedIds() } } }),
    aiUsage: await prisma.aiUsageLog.count({ where: { userId: { in: ownedIds() } } }),
  });

  const createExercise = (
    type: string,
    skill: "WRITING" | "SPEAKING" | "READING",
    content: object,
    answer: object | null,
    status: "PUBLISHED" | "HIDDEN" = "PUBLISHED",
  ) =>
    prisma.exercise.create({
      data: {
        type, skill, level: "B1", topic: `${prefix}_${type}`,
        content: content as Prisma.InputJsonValue,
        answer: answer === null ? Prisma.DbNull : (answer as Prisma.InputJsonValue),
        explanation: `EXPLANATION_${type}`, status, source: "TEACHER", createdById: users.owner,
      },
      select: { id: true },
    });

  const createAttempt = (
    exerciseId: number,
    assignmentId: number | null,
    answer: object | unknown[],
    extra: Partial<Prisma.AttemptUncheckedCreateInput> = {},
  ) =>
    prisma.attempt.create({
      data: {
        studentId: users.student, exerciseId, assignmentId,
        answer: answer as Prisma.InputJsonValue, ...extra,
      },
      select: { id: true },
    });

  beforeAll(async () => {
    const accounts = [
      ["owner", Role.TEACHER, UserStatus.ACTIVE],
      ["other", Role.TEACHER, UserStatus.ACTIVE],
      ["student", Role.STUDENT, UserStatus.ACTIVE],
      ["admin", Role.ADMIN, UserStatus.ACTIVE],
      ["pending", Role.TEACHER, UserStatus.PENDING],
      ["locked", Role.TEACHER, UserStatus.LOCKED],
    ] as const;
    for (const [name, role, status] of accounts) {
      const user = await prisma.user.create({
        data: { name: `${prefix}_${name}`, email: `${prefix}_${name}@test.local`, passwordHash: "unused-hash", role, status },
      });
      users[name] = user.id;
    }

    const newClass = (suffix: string, teacherId: number) =>
      prisma.class.create({
        data: { name: `${prefix}_${suffix}`, code: randomBytes(3).toString("hex").toUpperCase(), teacherId },
      });
    classAId = (await newClass("A", users.owner)).id;
    classBId = (await newClass("B", users.other)).id;
    await prisma.classMember.create({ data: { classId: classAId, studentId: users.student } });

    exerciseIds.writing = (await createExercise("writing", "WRITING", { prompt: "Write about your weekend." }, null)).id;
    exerciseIds.speaking = (await createExercise("speaking", "SPEAKING", { prompt: "Describe your room." }, null)).id;
    exerciseIds.choice = (
      await createExercise("multiple_choice", "READING", { questions: [{ q: "Pick", options: ["a", "b"] }] }, [1])
    ).id;
    exerciseIds.hidden = (
      await createExercise("multiple_choice", "READING", { questions: [{ q: "Hidden", options: ["x", "y"] }] }, [0], "HIDDEN")
    ).id;

    const dueAt = new Date(Date.now() + 3_600_000);
    const newAssignment = async (exerciseId: number, classId: number) =>
      (await prisma.assignment.create({
        data: { exerciseId, classId, assignedById: users.owner, dueAt },
        select: { id: true },
      })).id;
    assignmentWritingId = await newAssignment(exerciseIds.writing, classAId);
    const assignmentSpeaking = await newAssignment(exerciseIds.speaking, classAId);
    const assignmentChoice = await newAssignment(exerciseIds.choice, classAId);
    const assignmentHidden = await newAssignment(exerciseIds.hidden, classAId);
    const assignmentOther = await newAssignment(exerciseIds.writing, classBId);

    const aiFeedback = { criteria: { content: 7, grammar: 6 }, comment: "Bài viết khá tốt." };
    const errors = [{ type: "grammar:tense", text: "I go", correction: "I went", explanation: "Thì quá khứ" }];

    // Ghi đè thấp hơn điểm AI.
    attempts.override = (await createAttempt(exerciseIds.writing, assignmentWritingId, { text: "Last weekend I go to the park." }, {
      score: 8, teacherScore: 5, teacherComment: "Cần cải thiện ngữ pháp.", aiFeedback, errors, mode: "exam",
    })).id;
    // Không ghi đè.
    attempts.noOverride = (await createAttempt(exerciseIds.writing, assignmentWritingId, { text: "I like it." }, {
      score: 6.5, aiFeedback, errors,
    })).id;
    // Ghi đè bằng 0.
    attempts.zero = (await createAttempt(exerciseIds.writing, assignmentWritingId, { text: "Copied." }, {
      score: 6.5, teacherScore: 0, aiFeedback, errors,
    })).id;
    // Chờ AI: writing + speaking, score NULL, errors [], ai_feedback null.
    attempts.pendingWriting = (await createAttempt(exerciseIds.writing, assignmentWritingId, { text: "Waiting for AI." }, {
      errors: [],
    })).id;
    attempts.pendingSpeaking = (await createAttempt(exerciseIds.speaking, assignmentSpeaking, { text: "My room is small." }, {
      errors: [],
    })).id;
    // Trắc nghiệm tự chấm.
    attempts.choice = (await createAttempt(exerciseIds.choice, assignmentChoice, [1], { score: 10 })).id;
    // Đề đã HIDDEN.
    attempts.hidden = (await createAttempt(exerciseIds.hidden, assignmentHidden, [0], { score: 10 })).id;
    // Lớp B (GV "other" làm chủ).
    attempts.otherClass = (await createAttempt(exerciseIds.writing, assignmentOther, { text: "Class B." }, { score: 7 })).id;
    // Tự luyện.
    attempts.practice = (await createAttempt(exerciseIds.writing, null, { text: "Practice." }, { score: 7 })).id;

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    try {
      if (server) {
        const running = server;
        await new Promise<void>((resolve) => running.close(() => resolve()));
      }
      const owned = { in: ownedIds() };
      if (ownedIds().length) {
        await prisma.attempt.deleteMany({ where: { studentId: owned } });
        await prisma.auditLog.deleteMany({ where: { userId: owned } });
        await prisma.class.deleteMany({ where: { teacherId: owned } });
        await prisma.exercise.deleteMany({ where: { createdById: owned } });
        await prisma.user.deleteMany({ where: { id: owned } });
        expect(await prisma.user.count({ where: { email: { startsWith: prefix } } })).toBe(0);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  // ----- đúng -----
  it.each(["owner", "admin"])("%s đọc được bài writing đã chấm: đủ bài làm, đề, đáp án, điểm, nhận xét, AI, lỗi", async (user) => {
    const res = await request(attempts.override, user);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    const { attempt, student, exercise, assignment } = body.data;

    expect(attempt).toMatchObject({
      id: attempts.override,
      mode: "exam",
      answer: { text: "Last weekend I go to the park." },
      is_late: false,
      score: 8,
      max_score: 10,
      teacher_score: 5,
      teacher_comment: "Cần cải thiện ngữ pháp.",
      final_score: 5,
      ai_feedback: { criteria: { content: 7, grammar: 6 }, comment: "Bài viết khá tốt." },
      errors: [{ type: "grammar:tense", text: "I go", correction: "I went", explanation: "Thì quá khứ" }],
      grading_status: "GRADED",
    });
    expect(student).toEqual({ id: users.student, name: `${prefix}_student` });
    expect(exercise).toMatchObject({
      id: exerciseIds.writing, type: "writing", skill: "WRITING", level: "B1",
      content: { prompt: "Write about your weekend." }, answer: null, explanation: "EXPLANATION_writing",
    });
    expect(assignment).toMatchObject({ id: assignmentWritingId, class: { id: classAId, name: `${prefix}_A` } });
    expect(typeof assignment.due_at).toBe("string");
  });

  it("trắc nghiệm tự chấm: có đáp án + giải thích, GRADED", async () => {
    const body = await (await request(attempts.choice, "owner")).json();
    expect(body.data.attempt).toMatchObject({ score: 10, final_score: 10, answer: [1], grading_status: "GRADED" });
    expect(body.data.exercise).toMatchObject({ type: "multiple_choice", answer: [1], explanation: "EXPLANATION_multiple_choice" });
  });

  it("đề đã HIDDEN: GV và ADMIN vẫn thấy đáp án + giải thích đầy đủ", async () => {
    for (const user of ["owner", "admin"]) {
      const res = await request(attempts.hidden, user);
      expect(res.status).toBe(200);
      const { exercise } = (await res.json()).data;
      expect(exercise).toMatchObject({ answer: [0], explanation: "EXPLANATION_multiple_choice" });
    }
  });

  it("ADMIN đọc được bài của bất kỳ lớp nào; GV chủ lớp B đọc được bài lớp B", async () => {
    expect((await request(attempts.otherClass, "admin")).status).toBe(200);
    expect((await request(attempts.otherClass, "other")).status).toBe(200);
  });

  it("final_score: ghi đè thấp hơn, ghi đè 0, và không ghi đè", async () => {
    const final = async (id: number) => (await (await request(id, "owner")).json()).data.attempt;
    expect((await final(attempts.override)).final_score).toBe(5);
    expect(await final(attempts.zero)).toMatchObject({ teacher_score: 0, final_score: 0 });
    expect(await final(attempts.noOverride)).toMatchObject({ teacher_score: null, final_score: 6.5 });
  });

  // ----- chờ AI -----
  it.each([
    ["pendingWriting", "writing"],
    ["pendingSpeaking", "speaking"],
  ])("bài %s chờ AI: vẫn 200, PENDING, không ghi DB", async (key, type) => {
    const before = await attemptSnapshot();
    const sideBefore = await sideEffectCounts();

    for (const user of ["owner", "admin"]) {
      const res = await request(attempts[key], user);
      expect(res.status).toBe(200);
      const { attempt, exercise } = (await res.json()).data;
      expect(exercise.type).toBe(type);
      expect(attempt).toMatchObject({
        score: null, final_score: null, ai_feedback: null, errors: [], grading_status: "PENDING",
      });
    }

    expect(await attemptSnapshot()).toBe(before);
    expect(await sideEffectCounts()).toEqual(sideBefore);
  });

  // ----- 404 -----
  it("id không tồn tại, lớp GV khác, bài tự luyện (GV và ADMIN) đều trả CÙNG 404", async () => {
    const responses = await Promise.all([
      request(MISSING_ID, "owner"),
      request(attempts.otherClass, "owner"),
      request(attempts.override, "other"),
      request(attempts.practice, "owner"),
      request(attempts.practice, "admin"),
      request(MISSING_ID, "admin"),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(NOT_FOUND);
    }
  });

  // ----- phân quyền -----
  it("không token trả 401", async () => {
    expect((await request(attempts.override)).status).toBe(401);
  });

  it("HS trả 403, kể cả HS chủ bài nộp", async () => {
    const res = await request(attempts.override, "student");
    expect(res.status).toBe(403);
    expect((await res.json()).data).toBeNull();
  });

  it.each(["student", "pending", "locked"])("%s trả 403 trước khi kiểm tra id (id sai vẫn 403)", async (user) => {
    expect((await request("abc", user)).status).toBe(403);
    expect((await request(attempts.override, user)).status).toBe(403);
  });

  it.each(["abc", "0", "-1", "1.5"])("id sai định dạng %s: GV nhận 400 VALIDATION_ERROR", async (id) => {
    for (const user of ["owner", "admin"]) {
      const res = await request(id, user);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
  });

  // ----- rò rỉ -----
  it("không lộ passwordHash, email, audio, và đúng tập key (không field thừa)", async () => {
    for (const [key, user] of [["override", "owner"], ["pendingSpeaking", "admin"], ["choice", "owner"]]) {
      const res = await request(attempts[key], user);
      const text = await res.text();
      for (const secret of ["passwordHash", "password_hash", "unused-hash", "@test.local", "email", "audio", "uploads", "createdById", "created_by_id"]) {
        expect(text).not.toContain(secret);
      }
      const { data } = JSON.parse(text);
      expect(sorted(data)).toEqual(TOP_KEYS);
      expect(sorted(data.attempt)).toEqual(ATTEMPT_KEYS);
      expect(sorted(data.student)).toEqual(STUDENT_KEYS);
      expect(sorted(data.exercise)).toEqual(EXERCISE_KEYS);
      expect(sorted(data.assignment)).toEqual(ASSIGNMENT_KEYS);
      expect(sorted(data.assignment.class)).toEqual(CLASS_KEYS);
    }
  });

  it("chỉ đọc: gọi nhiều lần không đổi bài nộp, không tạo audit_logs/notifications/ai_usage_logs", async () => {
    const before = await attemptSnapshot();
    const sideBefore = await sideEffectCounts();
    for (const key of Object.keys(attempts)) {
      await request(attempts[key], "owner");
      await request(attempts[key], "admin");
    }
    expect(await attemptSnapshot()).toBe(before);
    expect(await sideEffectCounts()).toEqual(sideBefore);
  });
});