/** T14 bước 5: HTTP + PostgreSQL thật; chỉ mock AI và lỗi recompute được chủ động giả lập.
 * Tiền tố t14flow_ riêng; chỉ dọn user/dữ liệu của chính lần chạy này.
 * Cố định cửa sổ 10 trong file test để kết quả không phụ thuộc cấu hình máy.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Prisma, type Skill } from "@prisma/client";

const { gradeWritingMock } = vi.hoisted(() => {
  vi.stubEnv("SKILL_WINDOW_SIZE", "10");
  return { gradeWritingMock: vi.fn() };
});
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: gradeWritingMock }));

import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import * as refreshModule from "../skill-profiles/skill-profiles.refresh";
import * as recomputeModule from "../skill-profiles/skill-profiles.recompute";
import { AIQuotaExceededError, AIUsageCheckError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
type Row = Record<string, any>;
type Api = { status: number; data: Row; error: Row | null; raw: string };
const RUN = `t14flow_${randomUUID().replaceAll("-", "")}`;
const EXPLANATION = "Giải thích mẫu của giáo viên.";
const ESSAY = "I goes to school every day and enjoy learning English.";
const AI_GRADE = {
  criteria: { content: 7, coherence: 7, vocabulary: 7, grammar: 8 },
  comment: "Bài viết khá tốt.",
  errors: [{ type: "grammar:tense", text: "I goes", correction: "I go" }],
};
const AUTO = [
  { type: "multiple_choice", skill: "READING", content: { questions: [{ q: "Choose", options: ["a", "b"] }] }, answer: [1] },
  { type: "fill_blank", skill: "FOUNDATION", content: { text: "She ___ to ___." }, answer: ["goes", "school"] },
  { type: "matching", skill: "FOUNDATION", content: { left: ["cat"], right: ["mèo"] }, answer: [[0, 0]] },
  { type: "error_correction", skill: "WRITING", content: { sentence: "She go.", wrong: "go" }, answer: ["goes"] },
  { type: "listening_fill", skill: "LISTENING", content: { script: "She goes.", blanks: 1 }, answer: ["goes"] },
] as const;
const ownedUsers: number[] = [];
const exercises = new Map<string, number>();
let teacher = 0;
let classId = 0;
let writing = 0;
let counter = 0;
let server: Server | undefined;
let baseUrl = "";
let refreshSpy: ReturnType<typeof spyRefresh>;
const realRefresh = refreshModule.refreshProfileAfterGrading;
const spyRefresh = () => vi.spyOn(refreshModule, "refreshProfileAfterGrading");

const createUser = async (role: "STUDENT" | "TEACHER") => {
  const row = await prisma.user.create({ data: {
    name: `${RUN}_${++counter}`, email: `${RUN}_${counter}@test.local`,
    passwordHash: "test-only-hash", role, status: "ACTIVE",
  }, select: { id: true } });
  ownedUsers.push(row.id);
  return row.id;
};
const student = async (member = true) => {
  const id = await createUser("STUDENT");
  if (member) await prisma.classMember.create({ data: { classId, studentId: id } });
  return id;
};
const newExercise = async (
  type = "fill_blank", skill: Skill = "FOUNDATION",
  content: unknown = { text: "She ___ to ___." }, answer: unknown = ["goes", "school"],
) => (await prisma.exercise.create({ data: {
  type, skill, level: "A2", topic: `${RUN}_${++counter}`,
  content: content as Prisma.InputJsonValue,
  answer: answer === null ? Prisma.DbNull : answer as Prisma.InputJsonValue,
  explanation: EXPLANATION, status: "PUBLISHED", source: "TEACHER",
  inLibrary: true, createdById: teacher,
}, select: { id: true } })).id;
const assignment = async (exerciseId: number, late = false) =>
  (await prisma.assignment.create({ data: {
    exerciseId, classId, assignedById: teacher,
    dueAt: new Date(Date.now() + (late ? -3_600_000 : 3_600_000)),
  }, select: { id: true } })).id;
const request = async (userId: number, path: string, body?: unknown): Promise<Api> => {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json",
      Authorization: `Bearer ${jwt.sign({ userId }, env.JWT_SECRET)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  const parsed = JSON.parse(raw);
  expect(raw).not.toContain("passwordHash");
  expect(raw.includes(env.JWT_SECRET)).toBe(false);
  if (env.GEMINI_API_KEY) expect(raw.includes(env.GEMINI_API_KEY)).toBe(false);
  return { status: res.status, data: parsed.data, error: parsed.error, raw };
};
const submit = (id: number, exerciseId: number, answer: unknown, assignmentId?: number) =>
  request(id, "/attempts", { exerciseId, answer, ...(assignmentId === undefined ? {} : { assignmentId }) });
const submitWriting = (id: number, assignmentId?: number) =>
  submit(id, writing, { text: ESSAY }, assignmentId);
const regrade = (id: number, attemptId: number) => request(id, `/attempts/${attemptId}/regrade`);
const profile = (id: number, skill: Skill) =>
  prisma.skillProfile.findUnique({ where: { studentId_skill: { studentId: id, skill } } });
const once = (attemptId: number) => {
  const calls = refreshSpy.mock.calls.filter(([, id]) => id === attemptId);
  expect(calls).toHaveLength(1);
  // So sánh tham chiếu; không deep-equal PrismaClient (đối tượng proxy).
  expect(calls[0][0] === prisma).toBe(true);
};

/** Oracle chỉ ĐỌC: chọn đại diện bằng ROW_NUMBER của PostgreSQL, không gọi recompute. */
const checkProfile = async (id: number, skill: Skill, explicit?: Row) => {
  const rows = await prisma.$queryRaw<{ final_score: number; errors: unknown }[]>`
    WITH recent AS (
      SELECT a.* FROM attempts a JOIN exercises e ON e.id = a.exercise_id
      WHERE a.student_id = ${id} AND e.skill = ${skill}::skill
      ORDER BY a.submitted_at DESC, a.id DESC LIMIT 300
    ), ranked AS (
      SELECT *, COALESCE(teacher_score, score) AS final_score,
        ROW_NUMBER() OVER (
          PARTITION BY assignment_id, CASE WHEN assignment_id IS NULL THEN exercise_id END
          ORDER BY COALESCE(teacher_score, score) DESC, submitted_at DESC, id DESC
        ) AS rn
      FROM recent WHERE COALESCE(teacher_score, score) BETWEEN 0 AND 10
    )
    SELECT final_score, errors FROM ranked WHERE rn = 1
    ORDER BY submitted_at DESC, id DESC LIMIT 10
  `;
  expect(rows.length).toBeGreaterThan(0);
  const score = Math.round((rows.reduce((sum, row) => sum + row.final_score, 0) / rows.length
    + Number.EPSILON) * 100) / 100;
  const level = rows.length < 3 ? null : score >= 8 ? "B2" : score >= 6 ? "B1" : score >= 4 ? "A2" : "A1";
  const counts = new Map<string, number>();
  for (const row of rows) if (Array.isArray(row.errors)) for (const error of row.errors) {
    if (error && typeof error.type === "string" && error.type.trim())
      counts.set(error.type, (counts.get(error.type) ?? 0) + 1);
  }
  const actual = await profile(id, skill);
  expect(actual).not.toBeNull();
  const values = { score: actual!.score, level: actual!.level, errorStats: actual!.errorStats };
  expect(values).toEqual({ score, level, errorStats: Object.fromEntries(counts) });
  if (explicit) expect(values).toEqual(explicit);
  expect(await prisma.skillProfile.count({ where: { studentId: id, skill } })).toBe(1);
  return actual!;
};
const pending = async (id: number, assignmentId?: number) => {
  gradeWritingMock.mockRejectedValueOnce(new AIServiceError("RATE_LIMITED", 1));
  const res = await submitWriting(id, assignmentId);
  expect(res.status).toBe(202);
  return res.data.attemptId as number;
};

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  teacher = await createUser("TEACHER");
  classId = (await prisma.class.create({ data: {
    name: RUN, code: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(), teacherId: teacher,
  }, select: { id: true } })).id;
  for (const item of AUTO)
    exercises.set(item.type, await newExercise(item.type, item.skill, item.content, item.answer));
  writing = await newExercise("writing", "WRITING", { prompt: "Write about your day", minWords: 1 }, null);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  gradeWritingMock.mockReset().mockResolvedValue(structuredClone(AI_GRADE));
  refreshSpy = spyRefresh();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  vi.restoreAllMocks();
  try {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (ownedUsers.length) {
      const ids = { in: ownedUsers };
      await prisma.attempt.deleteMany({ where: { studentId: ids } });
      await prisma.skillProfile.deleteMany({ where: { studentId: ids } });
      await prisma.aiUsageLog.deleteMany({ where: { userId: ids } });
      await prisma.class.deleteMany({ where: { teacherId: ids } });
      await prisma.exercise.deleteMany({ where: { createdById: ids } });
      await prisma.user.deleteMany({ where: { id: ids } });
      expect(await prisma.user.count({ where: { email: { startsWith: RUN } } })).toBe(0);
    }
  } finally {
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  }
});

describe("T14 — chấm tự động", () => {
  it.each(AUTO)("$type: chấm, trả giải thích tự luyện, giới hạn 3 lần và refresh", async (item) => {
    const id = await student();
    const ex = exercises.get(item.type)!;
    const practice = await submit(id, ex, item.answer);
    expect(practice.status).toBe(201);
    expect(practice.data).toMatchObject({ score: 10, explanation: EXPLANATION });
    expect(practice.data).not.toHaveProperty("answer");
    once(practice.data.attemptId);
    const asg = await assignment(ex);
    for (let n = 1; n <= 3; n++) {
      const res = await submit(id, ex, item.answer, asg);
      expect(res.status).toBe(201);
      expect(res.data).toMatchObject({ score: 10, attemptNo: n, attemptsLeft: 3 - n });
      expect(res.data).not.toHaveProperty("answer");
      expect(res.data).not.toHaveProperty("explanation");
      once(res.data.attemptId);
      await checkProfile(id, item.skill);
    }
    const before = await profile(id, item.skill);
    expect((await submit(id, ex, item.answer, asg)).status).toBe(409);
    expect(refreshSpy).toHaveBeenCalledTimes(4);
    expect(await profile(id, item.skill)).toEqual(before);
  });

  it("tạo/cập nhật score, level, lỗi; FOUNDATION riêng với READING", async () => {
    const id = await student();
    const reading = await newExercise("fill_blank", "READING");
    expect((await submit(id, reading, ["goes", "school"])).status).toBe(201);
    const readingBefore = await profile(id, "READING");
    const first = exercises.get("fill_blank")!;
    let profileId = 0;
    const cases = [
      { ex: first, answer: ["x", "y"], score: 0, level: null, errors: 2 },
      { ex: await newExercise(), answer: ["goes", "y"], score: 2.5, level: null, errors: 3 },
      { ex: await newExercise(), answer: ["goes", "school"], score: 5, level: "A2", errors: 3 },
      { ex: first, answer: ["goes", "school"], score: 8.33, level: "B2", errors: 1 },
    ];
    for (const c of cases) {
      const res = await submit(id, c.ex, c.answer);
      expect(res.status).toBe(201);
      once(res.data.attemptId);
      const p = await checkProfile(id, "FOUNDATION", {
        score: c.score, level: c.level, errorStats: { "foundation:wrong_blank": c.errors },
      });
      if (profileId) expect(p.id).toBe(profileId);
      profileId = p.id;
      expect(await profile(id, "READING")).toEqual(readingBefore);
    }
    expect(refreshSpy).toHaveBeenCalledTimes(5);
  });

  it("bài giao nộp trễ 3 lần: chỉ điểm cao nhất, không đếm trùng lỗi", async () => {
    const id = await student();
    const ex = exercises.get("fill_blank")!;
    const asg = await assignment(ex, true);
    const answers = [["x", "y"], ["goes", "school"], ["goes", "y"]];
    for (let n = 0; n < 3; n++) {
      const res = await submit(id, ex, answers[n], asg);
      expect(res.status).toBe(201);
      const row = await prisma.attempt.findUniqueOrThrow({ where: { id: res.data.attemptId } });
      expect(row.isLate).toBe(true);
      once(row.id);
      await checkProfile(id, "FOUNDATION", { score: n === 0 ? 0 : 10, level: null,
        errorStats: n === 0 ? { "foundation:wrong_blank": 2 } : {} });
    }
    const before = await profile(id, "FOUNDATION");
    expect((await submit(id, ex, answers[1], asg)).status).toBe(409);
    expect(refreshSpy).toHaveBeenCalledTimes(3);
    expect(await profile(id, "FOUNDATION")).toEqual(before);
    const secondAssignment = await assignment(ex, true);
    expect((await submit(id, ex, answers[1], secondAssignment)).status).toBe(201);
    expect((await submit(id, ex, answers[0])).status).toBe(201);
    await checkProfile(id, "FOUNDATION", {
      score: 6.67, level: "B1", errorStats: { "foundation:wrong_blank": 2 },
    });
  });

  it("cửa sổ 10 bài: lỗi của bài rơi khỏi cửa sổ không còn được tính", async () => {
    const id = await student();
    for (let n = 0; n < 12; n++) {
      const res = await submit(id, await newExercise(), n < 2 ? ["x", "y"] : ["goes", "school"]);
      expect(res.status).toBe(201);
      once(res.data.attemptId);
      await checkProfile(id, "FOUNDATION");
    }
    await checkProfile(id, "FOUNDATION", { score: 10, level: "B2", errorStats: {} });
    expect(refreshSpy).toHaveBeenCalledTimes(12);
  });

  it("2 attempt khác bài, cùng kỹ năng, nộp song song: kết quả khớp DB, đúng 1 dòng", async () => {
    const id = await student();
    const ex1 = await newExercise();
    const ex2 = await newExercise();
    const results = await Promise.all([
      submit(id, ex1, ["x", "y"]), submit(id, ex2, ["goes", "school"]),
    ]);
    for (const res of results) { expect(res.status).toBe(201); once(res.data.attemptId); }
    expect(refreshSpy).toHaveBeenCalledTimes(2);
    await checkProfile(id, "FOUNDATION", {
      score: 5, level: null, errorStats: { "foundation:wrong_blank": 2 },
    });
  });

  it("student_id lấy từ token: HS A nộp không đổi hồ sơ HS B", async () => {
    const a = await student();
    const b = await student();
    const ex = exercises.get("fill_blank")!;
    expect((await submit(b, ex, ["goes", "school"])).status).toBe(201);
    const before = await profile(b, "FOUNDATION");
    refreshSpy.mockClear();
    const res = await request(a, "/attempts", {
      exerciseId: ex, answer: ["x", "y"], studentId: b, skill: "READING", score: 10,
    });
    expect(res.status).toBe(201);
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: res.data.attemptId } }))
      .toMatchObject({ studentId: a, score: 0 });
    once(res.data.attemptId);
    await checkProfile(a, "FOUNDATION", { score: 0, level: null, errorStats: { "foundation:wrong_blank": 2 } });
    expect(await profile(a, "READING")).toBeNull();
    expect(await profile(b, "FOUNDATION")).toEqual(before);
  });

   // T18: speaking đã mở; gửi { text } (dạng lưu, không phải dạng request) cũng là sai hình dạng -> 400.
  it.each([false, true])("nộp sai hình dạng (speaking=%s): 400, không tạo/refresh", async (speaking) => {
    const id = await student();
    const ex = speaking ? await newExercise("speaking", "SPEAKING", { prompt: "Speak" }, null)
      : exercises.get("fill_blank")!;
    expect((await submit(id, ex, { text: ESSAY })).status).toBe(400);
    expect(await prisma.attempt.count({ where: { studentId: id } })).toBe(0);
    expect(await prisma.skillProfile.count({ where: { studentId: id } })).toBe(0);
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});

describe("T14 — writing và chấm lại", () => {
  it.each(["practice", "assigned", "late"])("writing %s: refresh sau khi ghi điểm, response giữ nguyên", async (mode) => {
    const id = await student();
    const asg = mode === "practice" ? undefined : await assignment(writing, mode === "late");
    let scoreAtRefresh: number | null | undefined;
    refreshSpy.mockImplementation(async (db, attemptId) => {
      scoreAtRefresh = (await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } })).score;
      await realRefresh(db, attemptId);
    });
    const res = await submitWriting(id, asg);
    expect(res.status).toBe(201);
    expect(res.error).toBeNull();
    expect(scoreAtRefresh).toBe(7.25);
    once(res.data.attemptId);
    expect(res.data).toEqual({
      attemptId: res.data.attemptId, score: 7.25, maxScore: 10, graded: true, correct: 0, total: 0,
      errors: mode === "assigned" ? [{ type: "grammar:tense", text: "I goes" }] : AI_GRADE.errors,
      criteria: AI_GRADE.criteria, comment: AI_GRADE.comment,
      ...(mode !== "assigned" ? { explanation: EXPLANATION } : {}),
      ...(asg === undefined ? {} : { attemptNo: 1, attemptsLeft: 2 }),
    });
    expect(res.raw).not.toContain(ESSAY);
    await checkProfile(id, "WRITING", { score: 7.25, level: null, errorStats: { "grammar:tense": 1 } });
  });

  it.each([
    ["AI_QUOTA_EXCEEDED", () => new AIQuotaExceededError()],
    ["RATE_LIMITED", () => new AIServiceError("RATE_LIMITED", 1)],
    ["TIMEOUT", () => new AIServiceError("TIMEOUT", 1)],
    ["AI_UNAVAILABLE", () => new AIServiceError("AI_UNAVAILABLE", 1)],
    ["AI_INVALID_FORMAT", () => new AIInvalidFormatError(2)],
    ["AI_ERROR", () => new AIServiceError("AI_ERROR", 1)],
    ["AI_USAGE_CHECK_FAILED", () => new AIUsageCheckError()],
  ] as const)("AI lỗi %s: score=NULL, hồ sơ không đổi, refresh=0", async (code, makeError) => {
    const id = await student();
    expect((await submitWriting(id)).status).toBe(201);
    const before = await profile(id, "WRITING");
    refreshSpy.mockClear();
    gradeWritingMock.mockRejectedValueOnce(makeError());
    const res = await submitWriting(id);
    expect(res.status).toBe(202);
    expect(res.error).toBeNull();
    expect(res.data.gradingError).toMatchObject({ code });
    expect(res.data.attempt).toMatchObject({ score: null, graded: false });
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: res.data.attemptId } })).score).toBeNull();
    expect(await profile(id, "WRITING")).toEqual(before);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it.each(["minWords", "fourth", "outside", "teacher"])("writing bị từ chối %s: không chấm/refresh", async (reason) => {
    const id = await student(reason !== "outside");
    expect((await submitWriting(id)).status).toBe(201);
    const asg = await assignment(writing);
    if (reason === "fourth") for (let n = 0; n < 3; n++)
      expect((await submitWriting(id, asg)).status).toBe(201);
    const ex = reason === "minWords"
      ? await newExercise("writing", "WRITING", { prompt: "Write", minWords: 100 }, null) : writing;
    const before = await profile(id, "WRITING");
    const count = await prisma.attempt.count({ where: { studentId: { in: [id, teacher] } } });
    refreshSpy.mockClear();
    gradeWritingMock.mockClear();
    const res = await submit(reason === "teacher" ? teacher : id, ex, { text: ESSAY },
      reason === "minWords" ? undefined : asg);
    expect(res.status).toBe(reason === "minWords" ? 400 : reason === "fourth" ? 409 : reason === "outside" ? 404 : 403);
    expect(await profile(id, "WRITING")).toEqual(before);
    expect(await prisma.attempt.count({ where: { studentId: { in: [id, teacher] } } })).toBe(count);
    expect(gradeWritingMock).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("regrade thành công: cập nhật hồ sơ; gọi lại attempt đã chấm trả 409 và không refresh", async () => {
    const id = await student();
    const asg = await assignment(writing, true);
    const attemptId = await pending(id, asg);
    expect(await profile(id, "WRITING")).toBeNull();
    expect(refreshSpy).not.toHaveBeenCalled();
    const before = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    const res = await regrade(id, attemptId);
    expect(res.status).toBe(200);
    once(attemptId);
    expect(res.data).toMatchObject({ attemptId, score: 7.25, attemptNo: 1, attemptsLeft: 2, isLate: true });
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(after.submittedAt).toEqual(before.submittedAt);
    expect(after.isLate).toBe(before.isLate);
    expect(await prisma.attempt.count({ where: { studentId: id } })).toBe(1);
    const p = await checkProfile(id, "WRITING", { score: 7.25, level: null, errorStats: { "grammar:tense": 1 } });
    refreshSpy.mockClear();
    gradeWritingMock.mockClear();
    expect((await regrade(id, attemptId)).status).toBe(409);
    expect(await profile(id, "WRITING")).toEqual(p);
    expect(gradeWritingMock).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("regrade AI lỗi: vẫn chờ chấm, hồ sơ không đổi và refresh=0", async () => {
    const id = await student();
    expect((await submitWriting(id)).status).toBe(201);
    const attemptId = await pending(id);
    const before = await profile(id, "WRITING");
    refreshSpy.mockClear();
    gradeWritingMock.mockRejectedValueOnce(new AIServiceError("TIMEOUT", 1));
    const res = await regrade(id, attemptId);
    expect(res.status).toBe(202);
    expect(res.data.gradingError.code).toBe("TIMEOUT");
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } })).score).toBeNull();
    expect(await profile(id, "WRITING")).toEqual(before);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("2 regrade cùng attempt: 1 thắng/1 thua 409, refresh đúng 1 lần", async () => {
    const id = await student();
    const attemptId = await pending(id);
    let arrived = 0;
    let release!: () => void;
    const both = new Promise<void>((resolve) => { release = resolve; });
    gradeWritingMock.mockImplementation(async () => {
      if (++arrived === 2) release();
      await both;
      return structuredClone(AI_GRADE);
    });
    const results = await Promise.all([regrade(id, attemptId), regrade(id, attemptId)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(results.find((res) => res.status === 409)!.error!.code).toBe("ATTEMPT_ALREADY_GRADED");
    once(attemptId);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(await prisma.attempt.count({ where: { studentId: id } })).toBe(1);
    await checkProfile(id, "WRITING", { score: 7.25, level: null, errorStats: { "grammar:tense": 1 } });
  });
});

describe("T14 — best-effort", () => {
  it.each(["auto", "writing", "regrade"])("%s: recompute lỗi không mất điểm/đổi response", async (mode) => {
    const id = await student();
    const skill: Skill = mode === "auto" ? "FOUNDATION" : "WRITING";
    const ex = mode === "auto" ? exercises.get("fill_blank")! : writing;
    expect((await submit(id, ex, mode === "auto" ? ["goes", "school"] : { text: ESSAY })).status).toBe(201);
    const attemptId = mode === "regrade" ? await pending(id) : 0;
    const before = await profile(id, skill);
    refreshSpy.mockClear();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(recomputeModule, "recomputeSkillProfile")
      .mockRejectedValueOnce(Object.assign(new Error(ESSAY), { code: "P2002" }));
    const res = mode === "regrade" ? await regrade(id, attemptId)
      : await submit(id, ex, mode === "auto" ? ["goes", "school"] : { text: ESSAY });
    expect(res.status).toBe(mode === "regrade" ? 200 : 201);
    expect(res.error).toBeNull();
    expect(res.data).not.toHaveProperty("gradingError");
    expect(res.data).not.toHaveProperty("skillProfile");
    const saved = await prisma.attempt.findUniqueOrThrow({ where: { id: res.data.attemptId } });
    expect(saved.score).toBe(mode === "auto" ? 10 : 7.25);
    once(saved.id);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(await profile(id, skill)).toEqual(before);
    expect(log).toHaveBeenCalledExactlyOnceWith("[skill-profiles] refresh_after_grading_failed",
      { studentId: id, skill, code: "P2002" });
    const expected: Row = { attemptId: saved.id, score: saved.score, maxScore: 10, graded: true,
      correct: mode === "auto" ? 2 : 0, total: mode === "auto" ? 2 : 0,
      errors: mode === "auto" ? [] : AI_GRADE.errors, explanation: EXPLANATION };
    if (mode !== "auto") Object.assign(expected, { criteria: AI_GRADE.criteria, comment: AI_GRADE.comment });
    if (mode === "regrade") Object.assign(expected, {
      attemptNo: 2, isLate: false, submittedAt: saved.submittedAt.toISOString(),
    });
    expect(res.data).toEqual(expected);
  });
});
