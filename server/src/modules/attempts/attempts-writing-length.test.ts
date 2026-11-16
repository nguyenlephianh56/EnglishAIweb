/**
 * Test tích hợp (HTTP + PostgreSQL thật, gradeWriting được MOCK, KHÔNG gọi AI thật):
 * kiểm minWords + giới hạn độ dài bài Viết TRƯỚC khi lưu attempt/gọi AI (T13).
 *
 * - Tiền tố "t13l_" riêng để không xóa nhầm dữ liệu của test khác.
 * - Tự tạo user/lớp/bài/assignment riêng, xóa sạch sau khi chạy.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { MAX_ATTEMPTS_PER_ASSIGNMENT } from "./attempts.constants";

const { gradeWritingMock } = vi.hoisted(() => ({ gradeWritingMock: vi.fn() }));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: gradeWritingMock }));

const FAKE_GRADE = {
  criteria: { content: 7, coherence: 7, vocabulary: 7, grammar: 8 },
  comment: "Bài viết khá tốt.",
  errors: [] as unknown[],
};

const PREFIX = "t13l_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;
const MIN_WORDS = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const users = { teacher: 0, studentA: 0, outsider: 0 };
const ids = { classId: 0, w50: 0, w1: 0, wBig: 0, fillBlank: 0 };

let server: Server;
let baseUrl = "";

// ---------------------------------------------------------------------------
// Tạo / dọn dữ liệu
// ---------------------------------------------------------------------------
const createUser = async (label: string, role: "TEACHER" | "STUDENT") =>
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

const newWriting = async (minWords: number) =>
  (
    await prisma.exercise.create({
      data: {
        type: "writing",
        skill: "WRITING",
        level: "A2",
        topic: `${RUN_ID} writing ${minWords}`,
        content: { prompt: "Write about your day", minWords },
        answer: undefined,
        explanation: "Gợi ý của GV.",
        status: "PUBLISHED",
        source: "TEACHER",
        inLibrary: true,
        createdById: users.teacher,
      },
      select: { id: true },
    })
  ).id;

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.assignment.deleteMany({ where: { assignedById: { in: userIds } } });
  await prisma.class.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.aiUsageLog.deleteMany({ where: { userId: { in: userIds } } });
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
  users.studentA = await createUser("student_a", "STUDENT");
  users.outsider = await createUser("outsider", "STUDENT");

  const cls = await prisma.class.create({
    data: { name: `${RUN_ID} class`, code: randomClassCode(), teacherId: users.teacher },
    select: { id: true },
  });
  ids.classId = cls.id;
  await prisma.classMember.create({ data: { classId: ids.classId, studentId: users.studentA } });

  ids.w50 = await newWriting(MIN_WORDS);
  ids.w1 = await newWriting(1);
  ids.wBig = await newWriting(1000);
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
  gradeWritingMock.mockResolvedValue(structuredClone(FAKE_GRADE));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Hàm tiện ích
// ---------------------------------------------------------------------------
const post = async (body: unknown, userId: number) => {
  const res = await fetch(`${baseUrl}/api/v1/attempts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt.sign({ userId }, env.JWT_SECRET)}`,
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  return {
    status: res.status,
    rawText,
    body: JSON.parse(rawText) as {
      data: Row | null;
      error: { code: string; message: string; details?: Row } | null;
    },
  };
};

// Chuỗi n từ, mỗi từ 1 ký tự: n từ = 2n-1 ký tự (không vướng trần ký tự khi n nhỏ).
const words = (n: number) => Array.from({ length: n }, () => "a").join(" ");

const practice = (exerciseId: number, text: string, userId = users.studentA) =>
  post({ exerciseId, answer: { text } }, userId);

const newAssignment = async (exerciseId: number, dueOffsetMs = 24 * HOUR) =>
  (
    await prisma.assignment.create({
      data: {
        exerciseId,
        classId: ids.classId,
        assignedById: users.teacher,
        dueAt: new Date(Date.now() + dueOffsetMs),
      },
      select: { id: true },
    })
  ).id;

const asg = (assignmentId: number, text: string, userId = users.studentA) =>
  post({ assignmentId, answer: { text } }, userId);

const countAttempts = (studentId = users.studentA) =>
  prisma.attempt.count({ where: { studentId } });
const countUsageLogs = (userId = users.studentA) =>
  prisma.aiUsageLog.count({ where: { userId } });

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------
describe("T13: kiểm minWords + giới hạn độ dài bài Viết trước khi lưu/gọi AI", () => {
  it("sát biên minWords: đúng minWords -> 201; minWords-1 -> 400 WRITING_TOO_SHORT", async () => {
    const ok = await practice(ids.w50, words(MIN_WORDS));
    expect(ok.status).toBe(201);

    const bad = await practice(ids.w50, words(MIN_WORDS - 1));
    expect(bad.status).toBe(400);
    expect(bad.body.data).toBeNull();
    expect(bad.body.error!.code).toBe("WRITING_TOO_SHORT");
    expect(typeof bad.body.error!.message).toBe("string");
    expect(bad.body.error!.details).toEqual({ wordCount: MIN_WORDS - 1, minWords: MIN_WORDS });
  });

  it("sát biên số từ tối đa: đúng WRITING_MAX_WORDS -> 201; +1 -> 400 WRITING_TOO_LONG", async () => {
    const ok = await practice(ids.w50, words(env.WRITING_MAX_WORDS));
    expect(ok.status).toBe(201);

    const bad = await practice(ids.w50, words(env.WRITING_MAX_WORDS + 1));
    expect(bad.status).toBe(400);
    expect(bad.body.error!.code).toBe("WRITING_TOO_LONG");
    expect(bad.body.error!.details).toMatchObject({
      wordCount: env.WRITING_MAX_WORDS + 1,
      maxWords: env.WRITING_MAX_WORDS,
    });
  });

  it("sát biên ký tự tối đa: đúng WRITING_MAX_CHARS -> 201; +1 -> 400 WRITING_TOO_LONG", async () => {
    // 1 "từ" dài nhiều ký tự, minWords = 1 nên chỉ trần ký tự quyết định.
    const ok = await practice(ids.w1, "a".repeat(env.WRITING_MAX_CHARS));
    expect(ok.status).toBe(201);

    const bad = await practice(ids.w1, "a".repeat(env.WRITING_MAX_CHARS + 1));
    expect(bad.status).toBe(400);
    expect(bad.body.error!.code).toBe("WRITING_TOO_LONG");
    expect(bad.body.error!.details).toMatchObject({
      charCount: env.WRITING_MAX_CHARS + 1,
      maxChars: env.WRITING_MAX_CHARS,
    });
  });

  it("minWords lớn nới trần: minWords=1000 -> tối đa 3000 từ", async () => {
    const ok = await practice(ids.wBig, words(1000));
    expect(ok.status).toBe(201);

    const bad = await practice(ids.wBig, words(3001));
    expect(bad.status).toBe(400);
    expect(bad.body.error!.code).toBe("WRITING_TOO_LONG");
    expect(bad.body.error!.details).toMatchObject({ maxWords: 3000 });
  });

  it("bị từ chối -> không lưu attempt, không gọi AI, không ghi ai_usage_logs", async () => {
    const attemptsBefore = await countAttempts();
    const logsBefore = await countUsageLogs();

    const tooShort = await practice(ids.w50, words(MIN_WORDS - 1));
    const tooLong = await practice(ids.w50, words(env.WRITING_MAX_WORDS + 1));
    expect(tooShort.status).toBe(400);
    expect(tooLong.status).toBe(400);

    expect(await countAttempts()).toBe(attemptsBefore);
    expect(await countUsageLogs()).toBe(logsBefore);
    expect(gradeWritingMock).not.toHaveBeenCalled();
  });

  it("bài giao: nộp ngắn bị từ chối (nhiều lần) rồi nộp đủ -> được chấm, lần đếm là 1/3", async () => {
    const asgId = await newAssignment(ids.w50);

    for (let i = 0; i < MAX_ATTEMPTS_PER_ASSIGNMENT + 1; i++) {
      const bad = await asg(asgId, words(MIN_WORDS - 1));
      expect(bad.status).toBe(400);
      expect(bad.body.error!.code).toBe("WRITING_TOO_SHORT");
    }
    expect(await prisma.attempt.count({ where: { assignmentId: asgId } })).toBe(0);
    expect(gradeWritingMock).not.toHaveBeenCalled();

    const ok = await asg(asgId, words(MIN_WORDS));
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({
      attemptNo: 1,
      attemptsLeft: MAX_ATTEMPTS_PER_ASSIGNMENT - 1,
    });
    expect(gradeWritingMock).toHaveBeenCalledTimes(1);
    expect(await prisma.attempt.count({ where: { assignmentId: asgId } })).toBe(1);
  });

  it("bài giao đã đủ 3 lần: vẫn 409 ATTEMPT_LIMIT_REACHED (thứ tự cũ giữ nguyên), kể cả khi bài ngắn", async () => {
    const asgId = await newAssignment(ids.w50);
    for (let i = 0; i < MAX_ATTEMPTS_PER_ASSIGNMENT; i++) {
      await prisma.attempt.create({
        data: {
          studentId: users.studentA,
          exerciseId: ids.w50,
          assignmentId: asgId,
          mode: "practice",
          answer: { text: words(MIN_WORDS) },
          score: 7,
          maxScore: 10,
          errors: [],
        },
      });
    }
    const res = await asg(asgId, "quá ngắn");
    expect(res.status).toBe(409);
    expect(res.body.error!.code).toBe("ATTEMPT_LIMIT_REACHED");
  });

  it("nộp trễ hạn mà bài quá ngắn -> vẫn 400 WRITING_TOO_SHORT, không lưu", async () => {
    const asgId = await newAssignment(ids.w50, -HOUR); // đã quá hạn 1 giờ
    const bad = await asg(asgId, words(MIN_WORDS - 1));
    expect(bad.status).toBe(400);
    expect(bad.body.error!.code).toBe("WRITING_TOO_SHORT");
    expect(await prisma.attempt.count({ where: { assignmentId: asgId } })).toBe(0);
  });

  it("HS không có quyền với bài giao -> 404, không lộ minWords", async () => {
    const asgId = await newAssignment(ids.w50);
    const res = await asg(asgId, "ngắn", users.outsider);
    expect(res.status).toBe(404);
    expect(res.body.error!.code).toBe("NOT_FOUND");
    expect(res.rawText).not.toContain("minWords");
    expect(res.rawText).not.toContain("WRITING_TOO_SHORT");
  });

  it("dạng chấm tự động không bị ảnh hưởng (fill_blank bài ngắn vẫn chấm bình thường)", async () => {
    const res = await post({ exerciseId: ids.fillBlank, answer: ["goes"] }, users.studentA);
    expect(res.status).toBe(201);
    expect(res.body.data!.score).toBe(10);
    expect(gradeWritingMock).not.toHaveBeenCalled();
  });

  it("response/log lỗi không chứa nội dung bài viết hay bí mật", async () => {
    const MARKER = "NOIDUNGRIENGTU";
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
    ];

    const res = await practice(ids.w50, MARKER);
    expect(res.status).toBe(400);
    expect(res.rawText).not.toContain(MARKER);
    expect(res.rawText).not.toContain("passwordHash");
    expect(res.rawText).not.toContain(env.JWT_SECRET);
    if (env.GEMINI_API_KEY) expect(res.rawText).not.toContain(env.GEMINI_API_KEY);

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(MARKER);
    }
  });
});