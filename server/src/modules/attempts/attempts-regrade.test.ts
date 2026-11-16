/**
 * Test tích hợp (HTTP + PostgreSQL thật) cho POST /api/v1/attempts/:id/regrade (T13).
 *
 * - gradeWriting được MOCK (không gọi AI thật). Riêng nhóm "đi qua runAiTask thật" cho mock gọi
 *   gradeWriting THẬT với provider GIẢ (đếm hạn mức/ghi ai_usage_logs bằng DB thật).
 * - Tiền tố "t13r_" riêng để không xóa nhầm dữ liệu của test khác.
 * - Tự tạo user/lớp/bài/assignment riêng, xóa sạch sau khi chạy.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AIQuotaExceededError } from "../../ai/ai.types";
import type { AiTask } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { InMemoryAiCache } from "../../ai/ai.cache";
import { createPrismaUsageCounter, createPrismaUsageLogger } from "../../ai/ai.usage";
import { dailyLimitsFromEnv } from "../../ai/ai.usage.config";

const { gradeWritingMock } = vi.hoisted(() => ({ gradeWritingMock: vi.fn() }));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: gradeWritingMock }));

const PREFIX = "t13r_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;
const ESSAY = "My private essay about summer holidays";
const EXPLANATION = `${RUN_ID} goi y cua giao vien`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Res = { status: number; rawText: string; body: { data: Row | null; error: Row | null } };

const users = { teacher: 0, admin: 0, studentA: 0, studentB: 0 };
const ids = { classId: 0, writingLib: 0, fillBlank: 0 };

let server: Server;
let baseUrl = "";

const grade = (
  c: [number, number, number, number],
  errors: Row[] = [],
  comment = "Bài viết ổn."
) => ({
  criteria: { content: c[0], coherence: c[1], vocabulary: c[2], grammar: c[3] },
  comment,
  errors,
});

const AI_ERROR = {
  type: "grammar:tense",
  text: "I goes",
  correction: "I go",
  explanation: "Chủ ngữ I dùng động từ nguyên mẫu.",
};

const createUser = async (label: string, role: "TEACHER" | "STUDENT" | "ADMIN") =>
  (
    await prisma.user.create({
      data: {
        name: `${RUN_ID} ${label}`,
        email: `${RUN_ID}_${label}@test.local`,
        passwordHash: "not-a-real-hash",
        role,
        status: "ACTIVE",
      },
      select: { id: true },
    })
  ).id;

const randomClassCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.aiUsageLog.deleteMany({ where: { userId: { in: userIds } } });
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
  await cleanup(leftovers.map((u: { id: number }) => u.id));

  users.teacher = await createUser("teacher", "TEACHER");
  users.admin = await createUser("admin", "ADMIN");
  users.studentA = await createUser("student_a", "STUDENT");
  users.studentB = await createUser("student_b", "STUDENT");

  ids.classId = (
    await prisma.class.create({
      data: { name: `${RUN_ID} class`, code: randomClassCode(), teacherId: users.teacher },
      select: { id: true },
    })
  ).id;
  await prisma.classMember.createMany({
    data: [
      { classId: ids.classId, studentId: users.studentA },
      { classId: ids.classId, studentId: users.studentB },
    ],
  });

  ids.writingLib = (
    await prisma.exercise.create({
      data: {
        type: "writing",
        skill: "WRITING",
        level: "A2",
        topic: `${RUN_ID} writing`,
        content: { prompt: "Write about your day", minWords: 1 },
        answer: undefined,
        explanation: EXPLANATION,
        status: "PUBLISHED",
        source: "TEACHER",
        inLibrary: true,
        createdById: users.teacher,
      },
      select: { id: true },
    })
  ).id;

  ids.fillBlank = (
    await prisma.exercise.create({
      data: {
        type: "fill_blank",
        skill: "FOUNDATION",
        level: "A2",
        topic: `${RUN_ID} fill`,
        content: { text: "She ___ to school." },
        answer: ["goes"],
        status: "PUBLISHED",
        source: "TEACHER",
        inLibrary: true,
        createdById: users.teacher,
      },
      select: { id: true },
    })
  ).id;

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanup(Object.values(users).filter((id) => id > 0));
  await prisma.$disconnect();
});

beforeEach(() => {
  gradeWritingMock.mockReset();
});

const send = async (
  method: "GET" | "POST",
  path: string,
  userId: number | null,
  body?: unknown
): Promise<Res> => {
  const headers: Record<string, string> = {};
  if (userId !== null) headers.Authorization = `Bearer ${jwt.sign({ userId }, env.JWT_SECRET)}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) };
};

const post = (body: unknown, userId: number) => send("POST", "/api/v1/attempts", userId, body);
const get = (path: string, userId: number) => send("GET", path, userId);
// Không truyền body: regrade không nhận body.
const regrade = (attemptId: number | string, userId: number | null, body?: unknown) =>
  send("POST", `/api/v1/attempts/${attemptId}/regrade`, userId, body);

const newAssignment = (dueOffsetMs: number) =>
  prisma.assignment.create({
    data: {
      exerciseId: ids.writingLib,
      classId: ids.classId,
      assignedById: users.teacher,
      dueAt: new Date(Date.now() + dueOffsetMs),
    },
    select: { id: true },
  });

/** Nộp bài writing khi AI đang bận -> 202, trả attemptId của attempt đang chờ chấm. */
const submitPending = async (assignmentId?: number, userId = users.studentA): Promise<number> => {
  gradeWritingMock.mockRejectedValueOnce(new AIServiceError("RATE_LIMITED", 2));
  const res = await post(
    assignmentId === undefined
      ? { exerciseId: ids.writingLib, answer: { text: ESSAY } }
      : { assignmentId, answer: { text: ESSAY } },
    userId
  );
  expect(res.status).toBe(202);
  return res.body.data!.attemptId as number;
};

const countAttempts = (where: Row = {}) =>
  prisma.attempt.count({ where: { studentId: users.studentA, ...where } });

describe("POST /attempts/:id/regrade - chấm lại thành công", () => {
  it("bài giao: chấm lại CHÍNH dòng đó; không thêm dòng, không tốn lần nộp, is_late/submitted_at không đổi", async () => {
    const asg = await newAssignment(24 * HOUR);
    const id = await submitPending(asg.id);
    const before = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(await countAttempts({ assignmentId: asg.id })).toBe(1);

    gradeWritingMock.mockResolvedValueOnce(grade([8, 6, 7, 9], [AI_ERROR], "Chấm lại ổn."));
    const res = await regrade(id, users.studentA); // KHÔNG body

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({
      attemptId: id,
      graded: true,
      score: 7.5,
      maxScore: 10,
      attemptNo: 1,
      attemptsLeft: 2, // không tốn thêm lần nộp
      isLate: false,
      comment: "Chấm lại ổn.",
    });
    expect(res.body.data!.criteria).toEqual({ content: 8, coherence: 6, vocabulary: 7, grammar: 9 });

    // DB: cùng dòng, đã có score/ai_feedback/errors; số dòng không đổi; submitted_at/is_late giữ nguyên.
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(after.score).toBe(7.5);
    expect(after.aiFeedback).toEqual({
      criteria: { content: 8, coherence: 6, vocabulary: 7, grammar: 9 },
      comment: "Chấm lại ổn.",
    });
    expect(after.errors).toEqual([AI_ERROR]);
    expect(after.submittedAt.getTime()).toBe(before.submittedAt.getTime());
    expect(after.isLate).toBe(before.isLate);
    expect(await countAttempts({ assignmentId: asg.id })).toBe(1);

    // Bài viết lấy từ DB (không từ client).
    const lastCall = gradeWritingMock.mock.calls[gradeWritingMock.mock.calls.length - 1][0];
    expect(lastCall).toMatchObject({ userId: users.studentA, text: ESSAY });

    // Trạng thái bài giao: vẫn 1 lần nộp, điểm cao nhất = điểm vừa chấm.
    const detail = await get(`/api/v1/assignments/${asg.id}`, users.studentA);
    expect(detail.body.data).toMatchObject({ attemptsUsed: 1, bestScore: 7.5 });

    // Không lộ bài viết, bí mật.
    expect(res.rawText).not.toContain(ESSAY);
    expect(res.rawText).not.toContain("passwordHash");
    expect(res.rawText).not.toContain(env.JWT_SECRET);
    if (env.GEMINI_API_KEY) expect(res.rawText).not.toContain(env.GEMINI_API_KEY);
  });

  it("body (nếu client cố gửi) bị bỏ qua: bài lấy từ DB, điểm chỉ do AI quyết định", async () => {
    const id = await submitPending();
    gradeWritingMock.mockResolvedValueOnce(grade([4, 4, 4, 4]));
    const res = await regrade(id, users.studentA, {
      text: "HACKED TEXT",
      score: 10,
      studentId: users.studentB,
      errors: [],
    });
    expect(res.status).toBe(200);
    const lastCall = gradeWritingMock.mock.calls[gradeWritingMock.mock.calls.length - 1][0];
    expect(lastCall.text).toBe(ESSAY);
    expect(lastCall.userId).toBe(users.studentA);
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(row.score).toBe(4);
    expect(row.studentId).toBe(users.studentA);
  });

  it("tự luyện: lộ giải thích ngay (4c.4), không có attemptsLeft", async () => {
    const id = await submitPending();
    gradeWritingMock.mockResolvedValueOnce(grade([8, 8, 8, 8], [AI_ERROR]));
    const res = await regrade(id, users.studentA);
    expect(res.status).toBe(200);
    expect(res.body.data!.explanation).toBe(EXPLANATION);
    expect(res.body.data!.errors[0]).toMatchObject({ type: "grammar:tense", correction: "I go" });
    expect(res.body.data).not.toHaveProperty("attemptsLeft");
  });
});

describe("POST /attempts/:id/regrade - lộ đáp án theo 4c.4", () => {
  it("bài giao TRƯỚC due_at: không có answer/explanation/correction", async () => {
    const asg = await newAssignment(24 * HOUR);
    const id = await submitPending(asg.id);
    gradeWritingMock.mockResolvedValueOnce(grade([8, 8, 8, 8], [AI_ERROR]));
    const res = await regrade(id, users.studentA);
    expect(res.status).toBe(200);
    const data = res.body.data!;
    expect(data).not.toHaveProperty("answer");
    expect(data).not.toHaveProperty("explanation");
    expect(data.errors[0]).toMatchObject({ type: "grammar:tense", text: "I goes" });
    expect(data.errors[0]).not.toHaveProperty("correction");
    expect(data.errors[0]).not.toHaveProperty("explanation");
    expect(data.comment).toBeDefined(); // criteria + comment luôn hiện
    expect(res.rawText).not.toContain(EXPLANATION);
  });

  it("chấm lại SAU due_at vẫn được: lộ đủ theo 4c.4, is_late giữ nguyên theo lúc nộp (đúng hạn)", async () => {
    const asg = await newAssignment(24 * HOUR);
    const id = await submitPending(asg.id); // nộp lúc còn hạn -> is_late = false
    await prisma.assignment.update({
      where: { id: asg.id },
      data: { dueAt: new Date(Date.now() - HOUR) }, // giờ đã quá hạn
    });

    gradeWritingMock.mockResolvedValueOnce(grade([8, 8, 8, 8], [AI_ERROR]));
    const res = await regrade(id, users.studentA);
    expect(res.status).toBe(200);
    expect(res.body.data!.explanation).toBe(EXPLANATION);
    expect(res.body.data!.errors[0]).toMatchObject({ correction: "I go" });
    expect(res.body.data!.isLate).toBe(false);
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(row.isLate).toBe(false);
  });
});

describe("POST /attempts/:id/regrade - AI lỗi lại: attempt giữ nguyên, chấm lại tiếp được", () => {
  const failures: [string, () => Error][] = [
    ["AI_QUOTA_EXCEEDED", () => new AIQuotaExceededError()],
    ["TIMEOUT", () => new AIServiceError("TIMEOUT", 1)],
    ["AI_INVALID_FORMAT", () => new AIInvalidFormatError(2)],
  ];

  it.each(failures)("%s -> 202 + gradingError; DB vẫn NULL; sau đó chấm lại được", async (code, makeError) => {
    const asg = await newAssignment(24 * HOUR);
    const id = await submitPending(asg.id);
    const rowsBefore = await countAttempts({ assignmentId: asg.id });

    gradeWritingMock.mockRejectedValueOnce(makeError());
    const res = await regrade(id, users.studentA);

    expect(res.status).toBe(202);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({ attemptId: id });
    expect(res.body.data!.gradingError.code).toBe(code);
    expect(res.body.data!.gradingError.message).toContain("chưa được chấm");
    expect(res.body.data!.attempt).toMatchObject({
      attemptId: id,
      graded: false,
      score: null,
      attemptNo: 1,
      attemptsLeft: 2,
    });
    expect(res.rawText).not.toContain(ESSAY);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ score: null, aiFeedback: null, errors: [] });
    expect(await countAttempts({ assignmentId: asg.id })).toBe(rowsBefore);

    // Vẫn chấm lại được ở lần sau.
    gradeWritingMock.mockResolvedValueOnce(grade([7, 7, 7, 7]));
    const again = await regrade(id, users.studentA);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ graded: true, score: 7 });
  });
});

describe("POST /attempts/:id/regrade - quyền và điều kiện", () => {
  it("đã chấm -> 409 ATTEMPT_ALREADY_GRADED, KHÔNG gọi AI", async () => {
    gradeWritingMock.mockResolvedValueOnce(grade([9, 9, 9, 9]));
    const submit = await post({ exerciseId: ids.writingLib, answer: { text: ESSAY } }, users.studentA);
    expect(submit.status).toBe(201);
    const id = submit.body.data!.attemptId as number;
    const calls = gradeWritingMock.mock.calls.length;

    const res = await regrade(id, users.studentA);
    expect(res.status).toBe(409);
    expect(res.body.error!.code).toBe("ATTEMPT_ALREADY_GRADED");
    expect(gradeWritingMock.mock.calls.length).toBe(calls);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id } })).score).toBe(9);
  });

  it("HS khác -> 404 (không lộ attempt của người khác), attempt không đổi, không gọi AI", async () => {
    const id = await submitPending();
    const calls = gradeWritingMock.mock.calls.length;
    const res = await regrade(id, users.studentB);
    expect(res.status).toBe(404);
    expect(res.body.error!.code).toBe("NOT_FOUND");
    expect(gradeWritingMock.mock.calls.length).toBe(calls);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id } })).score).toBeNull();
  });

  it("attempt không tồn tại -> 404", async () => {
    const res = await regrade(2147483647, users.studentA);
    expect(res.status).toBe(404);
  });

  it("GV -> 403, ADMIN -> 403, không token -> 401, id không phải số -> 400", async () => {
    const id = await submitPending();
    const calls = gradeWritingMock.mock.calls.length;
    expect((await regrade(id, users.teacher)).status).toBe(403);
    expect((await regrade(id, users.admin)).status).toBe(403);
    expect((await regrade(id, null)).status).toBe(401);
    expect((await regrade("abc", users.studentA)).status).toBe(400);
    expect(gradeWritingMock.mock.calls.length).toBe(calls);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id } })).score).toBeNull();
  });

  it("dạng không phải writing (đã chấm tự động) -> 400 NOT_REGRADABLE, KHÔNG gọi AI", async () => {
    const submit = await post({ exerciseId: ids.fillBlank, answer: ["goes"] }, users.studentA);
    expect(submit.status).toBe(201);
    const res = await regrade(submit.body.data!.attemptId, users.studentA);
    expect(res.status).toBe(400);
    expect(res.body.error!.code).toBe("NOT_REGRADABLE");
    expect(gradeWritingMock).not.toHaveBeenCalled();
  });
});

describe("POST /attempts/:id/regrade - hai request song song", () => {
  it("đúng 1 lần ghi thắng (200), lần kia 409, không ghi đè", async () => {
    const id = await submitPending();
    gradeWritingMock
      .mockResolvedValueOnce(grade([4, 4, 4, 4], [], "Lần A"))
      .mockResolvedValueOnce(grade([8, 8, 8, 8], [], "Lần B"));

    const [r1, r2] = await Promise.all([
      regrade(id, users.studentA),
      regrade(id, users.studentA),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const winner = r1.status === 200 ? r1 : r2;
    const loser = r1.status === 200 ? r2 : r1;
    expect(loser.body.error!.code).toBe("ATTEMPT_ALREADY_GRADED");

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect([4, 8]).toContain(row.score);
    expect(winner.body.data!.score).toBe(row.score); // điểm trong DB = điểm lần thắng, không bị ghi đè
    expect((row.aiFeedback as Row).comment).toBe(row.score === 4 ? "Lần A" : "Lần B");
  });
});

describe("POST /attempts/:id/regrade - đi qua runAiTask thật (hạn mức ngày + log), provider GIẢ", () => {
  const providerGenerate = vi.fn();
  const fakeProvider = { name: "mock", generate: providerGenerate };

  beforeEach(async () => {
    providerGenerate.mockReset();
    await prisma.aiUsageLog.deleteMany({ where: { userId: users.studentA } });
    // gradeWriting THẬT (đếm hạn mức + ghi log bằng DB thật), chỉ provider là giả.
    gradeWritingMock.mockImplementation(async (input: unknown) => {
      const actual = await vi.importActual<typeof import("../../ai/writingGrader")>(
        "../../ai/writingGrader"
      );
      return actual.gradeWriting(input as Parameters<typeof actual.gradeWriting>[0], {
        ai: {
          provider: fakeProvider,
          cache: new InMemoryAiCache({ ttlMs: 1000, maxEntries: 10 }),
          counter: createPrismaUsageCounter(),
          logger: createPrismaUsageLogger(),
          limits: dailyLimitsFromEnv(),
          model: "test-model",
          cacheableTasks: new Set<AiTask>(),
        },
      });
    });
  });

  it("hết lượt ngày -> 202 AI_QUOTA_EXCEEDED, provider KHÔNG được gọi, log rate_limited, attempt vẫn NULL", async () => {
    // Tạo attempt chờ chấm trực tiếp (không đi qua AI) rồi dùng hết lượt hôm nay.
    const row = await prisma.attempt.create({
      data: {
        studentId: users.studentA,
        exerciseId: ids.writingLib,
        mode: "practice",
        answer: { text: ESSAY },
        score: null,
        maxScore: 10,
        errors: [],
      },
      select: { id: true },
    });
    await prisma.aiUsageLog.createMany({
      data: Array.from({ length: env.AI_DAILY_LIMIT_STUDENT }, () => ({
        userId: users.studentA,
        task: "grade_writing",
        status: "ok",
      })),
    });

    const res = await regrade(row.id, users.studentA);

    expect(res.status).toBe(202);
    expect(res.body.data!.gradingError.code).toBe("AI_QUOTA_EXCEEDED");
    expect(providerGenerate).not.toHaveBeenCalled();
    expect(
      await prisma.aiUsageLog.count({ where: { userId: users.studentA, status: "rate_limited" } })
    ).toBe(1);
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      score: null,
      aiFeedback: null,
      errors: [],
    });
  });

  it("còn lượt -> provider được gọi 1 lần, chấm xong, ghi 1 log ok", async () => {
    const row = await prisma.attempt.create({
      data: {
        studentId: users.studentA,
        exerciseId: ids.writingLib,
        mode: "practice",
        answer: { text: ESSAY },
        score: null,
        maxScore: 10,
        errors: [],
      },
      select: { id: true },
    });
    providerGenerate.mockResolvedValue({
      text: JSON.stringify(grade([8, 8, 8, 8], [], "Bài viết tốt.")),
      model: "test-model",
    });

    const res = await regrade(row.id, users.studentA);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ graded: true, score: 8 });
    expect(providerGenerate).toHaveBeenCalledTimes(1);
    expect(
      await prisma.aiUsageLog.count({
        where: { userId: users.studentA, task: "grade_writing", status: "ok" },
      })
    ).toBe(1);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: row.id } })).score).toBe(8);
  });
});