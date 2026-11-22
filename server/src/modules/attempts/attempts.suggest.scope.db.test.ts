/** T27 bước 3: PostgreSQL thật, KHÔNG gọi AI. Tiền tố t27scope_ riêng; chỉ dọn dữ liệu của lần chạy này.
 *  Chứng minh: (1) phạm vi của gợi ý nhận xét cho CÙNG kết quả phân quyền với PATCH /attempts/:id/grade
 *  (T20, qua updateTeacherGrade); (2) điều kiện 422 kiểm trước AI; (3) toàn bộ chỉ ĐỌC.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { updateTeacherGrade } from "./attempts.grade.service";
import { prepareSuggest, SuggestInputError } from "./attempts.suggest.prepare";
import { findSuggestAttempt } from "./attempts.suggest.scope";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const RUN = `t27scope_${randomUUID().replaceAll("-", "")}`;
const ESSAY = "Last weekend I go to the park with my friend.";
const MISSING_ID = 2_000_000_000;
const ownedUsers: number[] = [];
let counter = 0;

const ids = {
  teacherA: 0, teacherB: 0, admin: 0, student: 0,
  classA: 0, classB: 0,
  writingScored: 0, speakingUnscored: 0, multipleChoice: 0, emptyText: 0,
  otherClass: 0, practice: 0,
};

const createUser = async (role: Role) => {
  const row = await prisma.user.create({
    data: {
      name: `${RUN}_${++counter}`, email: `${RUN}_${counter}@test.local`,
      passwordHash: "test-only-hash", role, status: "ACTIVE",
    },
    select: { id: true },
  });
  ownedUsers.push(row.id);
  return row.id;
};

const createExercise = async (type: string, skill: "WRITING" | "SPEAKING" | "READING", content: unknown, answer: unknown) =>
  (await prisma.exercise.create({
    data: {
      type, skill, level: "B1", topic: `${RUN}_${++counter}`,
      content: content as Prisma.InputJsonValue,
      answer: answer === null ? Prisma.DbNull : (answer as Prisma.InputJsonValue),
      explanation: "EXPLANATION-SECRET", status: "PUBLISHED", source: "TEACHER",
      inLibrary: false, createdById: ids.teacherA,
    },
    select: { id: true },
  })).id;

const createAssignment = async (exerciseId: number, classId: number) =>
  (await prisma.assignment.create({
    data: { exerciseId, classId, assignedById: ids.teacherA, dueAt: new Date(Date.now() + 3_600_000) },
    select: { id: true },
  })).id;

const createAttempt = async (
  exerciseId: number, assignmentId: number | null, answer: unknown, extra: Partial<Prisma.AttemptUncheckedCreateInput> = {},
) =>
  (await prisma.attempt.create({
    data: {
      studentId: ids.student, exerciseId, assignmentId,
      answer: answer as Prisma.InputJsonValue, ...extra,
    },
    select: { id: true },
  })).id;

const snapshot = async () =>
  JSON.stringify(await prisma.attempt.findMany({ where: { studentId: ids.student }, orderBy: { id: "asc" } }));

const actors = () => ({
  teacherA: { id: ids.teacherA, role: "TEACHER" as Role },
  teacherB: { id: ids.teacherB, role: "TEACHER" as Role },
  admin: { id: ids.admin, role: "ADMIN" as Role },
  student: { id: ids.student, role: "STUDENT" as Role },
});

const failure = async (actor: { id: number; role: Role }, attemptId: number) => {
  const error = await prepareSuggest(actor, attemptId).catch((e) => e);
  expect(error).toBeInstanceOf(SuggestInputError);
  return error as SuggestInputError;
};

beforeAll(async () => {
  ids.teacherA = await createUser("TEACHER");
  ids.teacherB = await createUser("TEACHER");
  ids.admin = await createUser("ADMIN");
  ids.student = await createUser("STUDENT");
  ids.classA = (await prisma.class.create({
    data: { name: `${RUN}_A`, code: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(), teacherId: ids.teacherA },
    select: { id: true },
  })).id;
  ids.classB = (await prisma.class.create({
    data: { name: `${RUN}_B`, code: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(), teacherId: ids.teacherB },
    select: { id: true },
  })).id;

  const writing = await createExercise("writing", "WRITING", { prompt: "Write about your weekend.", minWords: 20 }, null);
  const speaking = await createExercise("speaking", "SPEAKING", { prompt: "Describe your room.", sample: "SAMPLE-SECRET" }, null);
  const choice = await createExercise(
    "multiple_choice", "READING", { questions: [{ q: "Pick", options: ["a", "b"] }] }, [1],
  );
  const asgWriting = await createAssignment(writing, ids.classA);
  const asgSpeaking = await createAssignment(speaking, ids.classA);
  const asgChoice = await createAssignment(choice, ids.classA);
  const asgOther = await createAssignment(writing, ids.classB);

  ids.writingScored = await createAttempt(writing, asgWriting, { text: ESSAY }, {
    score: 6.5,
    aiFeedback: { criteria: { content: 7, coherence: 6, vocabulary: 6, grammar: 7 }, comment: "Bài viết khá tốt.", raw: "RAW-SECRET" },
    errors: [{ type: "grammar:tense", text: "I go", correction: "I went", explanation: "ERROR-EXPLANATION-SECRET" }],
  });
  ids.speakingUnscored = await createAttempt(speaking, asgSpeaking, { text: "My room is small and nice." });
  ids.multipleChoice = await createAttempt(choice, asgChoice, [1], { score: 10 });
  ids.emptyText = await createAttempt(writing, asgWriting, { text: "   " });
  ids.otherClass = await createAttempt(writing, asgOther, { text: ESSAY });
  ids.practice = await createAttempt(writing, null, { text: ESSAY });
});

afterAll(async () => {
  try {
    if (ownedUsers.length) {
      const owned = { in: ownedUsers };
      await prisma.attempt.deleteMany({ where: { studentId: owned } });
      await prisma.auditLog.deleteMany({ where: { userId: owned } });
      await prisma.aiUsageLog.deleteMany({ where: { userId: owned } });
      await prisma.class.deleteMany({ where: { teacherId: owned } });
      await prisma.exercise.deleteMany({ where: { createdById: owned } });
      await prisma.user.deleteMany({ where: { id: owned } });
      expect(await prisma.user.count({ where: { email: { startsWith: RUN } } })).toBe(0);
    }
  } finally {
    await prisma.$disconnect();
  }
});

describe("phạm vi: GV chủ lớp / ADMIN / còn lại", () => {
  it("GV chủ lớp: bài Viết đã chấm và bài Nói chưa có điểm AI đều chuẩn bị được", async () => {
    const written = await prepareSuggest(actors().teacherA, ids.writingScored);
    expect(written.attemptId).toBe(ids.writingScored);
    expect(written.variables).toMatchObject({
      type: "writing", skill: "WRITING", level: "B1",
      exercise_prompt: "Write about your weekend.", student_text: ESSAY,
    });
    const grading = JSON.parse(written.variables.grading_data);
    expect(grading).toMatchObject({
      score: 6.5, teacher_score: null, comment: "Bài viết khá tốt.",
      errors: [{ type: "grammar:tense", correction: "I went" }],
    });

    const spoken = await prepareSuggest(actors().teacherA, ids.speakingUnscored);
    expect(spoken.variables).toMatchObject({ type: "speaking", student_text: "My room is small and nice." });
    expect(JSON.parse(spoken.variables.grading_data)).toMatchObject({ score: null, errors: [] });
  });

  it("ADMIN: mọi lớp (A và B)", async () => {
    await expect(prepareSuggest(actors().admin, ids.writingScored)).resolves.toBeDefined();
    await expect(prepareSuggest(actors().admin, ids.otherClass)).resolves.toBeDefined();
  });

  it("GV lớp khác, bài tự luyện, id không tồn tại -> 404 GIỐNG HỆT NHAU (status, code, message)", async () => {
    const results = [
      await failure(actors().teacherA, ids.otherClass),
      await failure(actors().teacherB, ids.writingScored),
      await failure(actors().teacherA, ids.practice),
      await failure(actors().admin, ids.practice),
      await failure(actors().teacherA, MISSING_ID),
      await failure(actors().student, ids.writingScored),
    ];
    for (const error of results) {
      expect({ s: error.statusCode, c: error.code, m: error.message }).toEqual({
        s: 404, c: "NOT_FOUND", m: "Không tìm thấy bài nộp",
      });
    }
  });

  it("GV B thấy bài lớp B của mình", async () => {
    await expect(prepareSuggest(actors().teacherB, ids.otherClass)).resolves.toBeDefined();
  });
});

describe("điều kiện nghiệp vụ (kiểm trong phạm vi, trước AI)", () => {
  it("bài trắc nghiệm của bài giao -> 422 UNSUPPORTED_EXERCISE_TYPE", async () => {
    const error = await failure(actors().teacherA, ids.multipleChoice);
    expect(error).toMatchObject({ statusCode: 422, code: "UNSUPPORTED_EXERCISE_TYPE" });
  });

  it("answer.text rỗng sau trim -> 422 NO_TEXT_TO_COMMENT", async () => {
    const error = await failure(actors().teacherA, ids.emptyText);
    expect(error).toMatchObject({ statusCode: 422, code: "NO_TEXT_TO_COMMENT" });
  });

  it("ngoài phạm vi thì 404 chứ không lộ 422 (không lộ dạng bài/nội dung của bài lớp khác)", async () => {
    const error = await failure(actors().teacherB, ids.multipleChoice);
    expect(error).toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });
});

describe("ma trận phân quyền khớp PATCH /attempts/:id/grade (lockGradeAttempt)", () => {
  it("mọi (vai trò × bài nộp) cho cùng kết quả có/không thấy bài", async () => {
    const attemptIds = [
      ids.writingScored, ids.speakingUnscored, ids.multipleChoice, ids.emptyText,
      ids.otherClass, ids.practice, MISSING_ID,
    ];
    const before = await snapshot();
    let visible = 0;

    for (const [name, actor] of Object.entries(actors())) {
      for (const attemptId of attemptIds) {
        const suggest = (await findSuggestAttempt(actor, attemptId)) !== null;
        // PATCH không đổi gì (teacher_comment null = giá trị hiện có) -> không ghi, không audit.
        const grade = (await updateTeacherGrade(actor, attemptId, { teacher_comment: null })) !== null;
        expect({ name, attemptId, suggest }).toEqual({ name, attemptId, suggest: grade });
        if (suggest) visible += 1;
      }
    }

    expect(visible).toBeGreaterThan(0);
    expect(await snapshot()).toBe(before);
    expect(await prisma.auditLog.count({ where: { userId: { in: ownedUsers } } })).toBe(0);
  });
});

describe("chỉ đọc, không lộ dữ liệu", () => {
  it("gọi nhiều lần không đổi bài nộp, không tạo audit_logs, notifications, ai_usage_logs", async () => {
    const before = await snapshot();
    for (const attemptId of [ids.writingScored, ids.speakingUnscored, ids.multipleChoice, ids.practice]) {
      await prepareSuggest(actors().admin, attemptId).catch(() => undefined);
      await prepareSuggest(actors().teacherA, attemptId).catch(() => undefined);
    }
    expect(await snapshot()).toBe(before);
    expect(await prisma.auditLog.count({ where: { userId: { in: ownedUsers } } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: { in: ownedUsers } } })).toBe(0);
    expect(await prisma.aiUsageLog.count({ where: { userId: { in: ownedUsers } } })).toBe(0);
  });

  it("biến gửi AI không chứa tên/email/id người dùng, đáp án, explanation, sample, ai_feedback thô", async () => {
    const { variables } = await prepareSuggest(actors().teacherA, ids.writingScored);
    const json = JSON.stringify(variables);
    for (const secret of [
      RUN, "@test.local", "EXPLANATION-SECRET", "SAMPLE-SECRET", "RAW-SECRET",
      "ERROR-EXPLANATION-SECRET", "minWords", String(ids.student), String(ids.teacherA),
    ]) {
      expect(json).not.toContain(secret);
    }
  });
});