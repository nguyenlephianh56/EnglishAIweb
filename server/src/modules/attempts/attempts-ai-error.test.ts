/**
 * Test tích hợp (HTTP + PostgreSQL thật, gradeWriting được MOCK, KHÔNG gọi AI thật):
 * T13, dòng "lỗi AI/hết lượt: không mất bài làm HS".
 *
 * Khi AI lỗi SAU khi attempt đã lưu: attempt giữ nguyên (score/ai_feedback NULL, errors []),
 * HS nhận 202 + gradingError + attemptId; lần nộp vẫn tính vào 3 lần của bài giao.
 *
 * - Tiền tố "t13e_" riêng để không xóa nhầm dữ liệu của test khác.
 * - Tự tạo user/lớp/bài/assignment riêng, xóa sạch sau khi chạy.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AIQuotaExceededError, AIUsageCheckError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { MAX_ATTEMPTS_PER_ASSIGNMENT } from "./attempts.constants";

const { gradeWritingMock } = vi.hoisted(() => ({ gradeWritingMock: vi.fn() }));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: gradeWritingMock }));

const PREFIX = "t13e_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;
const ESSAY = "My private essay about summer holidays";
const EXPLANATION = `${RUN_ID} goi y cua giao vien`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const users = { teacher: 0, studentA: 0 };
const ids = { classId: 0, writingLib: 0 };

let server: Server;
let baseUrl = "";

const grade = (c: [number, number, number, number]) => ({
  criteria: { content: c[0], coherence: c[1], vocabulary: c[2], grammar: c[3] },
  comment: "Bài viết ổn.",
  errors: [],
});

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

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
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
  users.studentA = await createUser("student_a", "STUDENT");

  ids.classId = (
    await prisma.class.create({
      data: { name: `${RUN_ID} class`, code: randomClassCode(), teacherId: users.teacher },
      select: { id: true },
    })
  ).id;
  await prisma.classMember.create({ data: { classId: ids.classId, studentId: users.studentA } });

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
    body: JSON.parse(rawText) as { data: Row | null; error: Row | null },
  };
};

const get = async (path: string, userId: number) => {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${jwt.sign({ userId }, env.JWT_SECRET)}` },
  });
  return { status: res.status, body: (await res.json()) as { data: Row | null } };
};

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

const countAttempts = () => prisma.attempt.count({ where: { studentId: users.studentA } });

const latestAttempt = () =>
  prisma.attempt.findFirst({ where: { studentId: users.studentA }, orderBy: { id: "desc" } });

// [mã lỗi mong đợi, cách tạo lỗi, cụm từ lý do thân thiện phải có trong message]
const AI_FAILURES: [string, () => Error, string][] = [
  ["AI_QUOTA_EXCEEDED", () => new AIQuotaExceededError(), "hết lượt"],
  ["RATE_LIMITED", () => new AIServiceError("RATE_LIMITED", 2, { retryAfterMs: 4321 }), "đang bận"],
  ["TIMEOUT", () => new AIServiceError("TIMEOUT", 1), "hết thời gian"],
  ["AI_UNAVAILABLE", () => new AIServiceError("AI_UNAVAILABLE", 2), "lỗi tạm thời"],
  ["AI_INVALID_FORMAT", () => new AIInvalidFormatError(2), "lỗi tạm thời"],
  ["AI_ERROR", () => new AIServiceError("AI_ERROR", 1), "lỗi tạm thời"],
  ["AI_USAGE_CHECK_FAILED", () => new AIUsageCheckError(), "lỗi tạm thời"],
];

describe("POST /attempts - AI lỗi sau khi đã lưu: 202 + gradingError, bài không mất", () => {
  it.each(AI_FAILURES)("%s", async (code, makeError, reason) => {
    gradeWritingMock.mockRejectedValue(makeError());
    const before = await countAttempts();

    const res = await post({ exerciseId: ids.writingLib, answer: { text: ESSAY } }, users.studentA);

    // 202: bài ĐÃ lưu, không phải nộp thất bại; không có error.
    expect(res.status).toBe(202);
    expect(res.body.error).toBeNull();
    const data = res.body.data!;

    // Attempt còn trong DB, trạng thái "chờ chấm": không có gì nửa vời.
    expect(await countAttempts()).toBe(before + 1);
    const row = await latestAttempt();
    expect(row).toMatchObject({
      score: null,
      aiFeedback: null,
      errors: [],
      maxScore: 10,
      assignmentId: null,
      isLate: false,
    });
    expect(row!.answer).toEqual({ text: ESSAY });

    // Phản hồi: attemptId + attempt chưa chấm + gradingError đúng mã, nói rõ "đã lưu, chưa chấm".
    expect(data.attemptId).toBe(row!.id);
    expect(data.attempt).toMatchObject({
      attemptId: row!.id,
      score: null,
      maxScore: 10,
      graded: false,
      errors: [],
    });
    expect(data.attempt.criteria).toBeUndefined();
    expect(data.attempt.comment).toBeUndefined();
    expect(Object.keys(data.gradingError).sort()).toEqual(["code", "message"]);
    expect(data.gradingError.code).toBe(code);
    expect(data.gradingError.message).toContain("đã được lưu");
    expect(data.gradingError.message).toContain("chưa được chấm");
    expect(data.gradingError.message).toContain(reason);

    // Không lộ bài viết, chi tiết nội bộ, bí mật.
    expect(res.rawText).not.toContain(ESSAY);
    expect(res.rawText).not.toContain("4321");
    expect(res.rawText).not.toContain("passwordHash");
    expect(res.rawText).not.toContain(env.JWT_SECRET);
    if (env.GEMINI_API_KEY) expect(res.rawText).not.toContain(env.GEMINI_API_KEY);
  });

  it("tự luyện: lộ đáp án theo 4c (explanation có), nhưng chưa có criteria/comment vì chưa chấm", async () => {
    gradeWritingMock.mockRejectedValue(new AIServiceError("TIMEOUT", 1));
    const res = await post({ exerciseId: ids.writingLib, answer: { text: ESSAY } }, users.studentA);
    expect(res.status).toBe(202);
    expect(res.body.data!.attempt.explanation).toBe(EXPLANATION);
  });

  it("lỗi KHÔNG phải AI (DB...) xử lý như cũ: 500 chung, không lộ chi tiết; bài vẫn đã lưu", async () => {
    gradeWritingMock.mockRejectedValue(new Error("db exploded secret-detail"));
    const before = await countAttempts();
    const res = await post({ exerciseId: ids.writingLib, answer: { text: ESSAY } }, users.studentA);
    expect(res.status).toBe(500);
    expect(res.body.data).toBeNull();
    expect(res.body.error!.code).toBe("INTERNAL_SERVER_ERROR");
    expect(res.rawText).not.toContain("secret-detail");
    expect(await countAttempts()).toBe(before + 1);
    expect(await latestAttempt()).toMatchObject({ score: null, aiFeedback: null, errors: [] });
  });
});

describe("Bài giao: lần nộp chưa chấm vẫn tính vào 3 lần (4c.3)", () => {
  it("1/3 (chưa chấm) -> 2/3 (chấm) -> 3/3 (chưa chấm) -> lần 4 bị từ chối; graded + điểm cao nhất bỏ NULL", async () => {
    const asg = await newAssignment(24 * HOUR);

    // Lần 1: AI bận -> 202, vẫn tính 1/3.
    gradeWritingMock.mockRejectedValueOnce(new AIServiceError("RATE_LIMITED", 2));
    const r1 = await post({ assignmentId: asg.id, answer: { text: "Essay 1" } }, users.studentA);
    expect(r1.status).toBe(202);
    expect(r1.body.data!.attempt).toMatchObject({ attemptNo: 1, attemptsLeft: 2, graded: false });
    const id1 = r1.body.data!.attemptId as number;

    // Trạng thái bài giao + lịch sử sau lần 1: đã nộp, chưa có điểm.
    const detail1 = await get(`/api/v1/assignments/${asg.id}`, users.studentA);
    expect(detail1.status).toBe(200);
    expect(detail1.body.data).toMatchObject({ status: "SUBMITTED", attemptsUsed: 1, bestScore: null });
    const hist1 = await get(`/api/v1/attempts?assignmentId=${asg.id}`, users.studentA);
    expect(hist1.body.data).toMatchObject({ attemptsCount: 1, bestScore: null });
    expect(hist1.body.data!.items[0]).toMatchObject({ id: id1, graded: false, score: null, finalScore: null });

    // Lần 2: nộp MỚI, AI ổn -> tốn thêm 1 lần (2/3).
    gradeWritingMock.mockResolvedValueOnce(grade([8, 8, 8, 8]));
    const r2 = await post({ assignmentId: asg.id, answer: { text: "Essay 2" } }, users.studentA);
    expect(r2.status).toBe(201);
    expect(r2.body.data).toMatchObject({ attemptNo: 2, attemptsLeft: 1, graded: true, score: 8 });
    const id2 = r2.body.data!.attemptId as number;

    // Lần 3: hết lượt AI hôm nay -> 202, tính 3/3.
    gradeWritingMock.mockRejectedValueOnce(new AIQuotaExceededError());
    const r3 = await post({ assignmentId: asg.id, answer: { text: "Essay 3" } }, users.studentA);
    expect(r3.status).toBe(202);
    expect(r3.body.data!.attempt).toMatchObject({ attemptNo: 3, attemptsLeft: 0, graded: false });
    expect(r3.body.data!.gradingError.code).toBe("AI_QUOTA_EXCEEDED");
    const id3 = r3.body.data!.attemptId as number;
    expect(gradeWritingMock).toHaveBeenCalledTimes(MAX_ATTEMPTS_PER_ASSIGNMENT);

    // Lần 4: vẫn bị từ chối, KHÔNG gọi AI.
    const r4 = await post({ assignmentId: asg.id, answer: { text: "Essay 4" } }, users.studentA);
    expect(r4.status).toBe(409);
    expect(r4.body.error!.code).toBe("ATTEMPT_LIMIT_REACHED");
    expect(gradeWritingMock).toHaveBeenCalledTimes(MAX_ATTEMPTS_PER_ASSIGNMENT);

    // Lịch sử: 3 dòng, graded đúng từng dòng, điểm cao nhất bỏ qua NULL.
    const hist = await get(`/api/v1/attempts?assignmentId=${asg.id}`, users.studentA);
    expect(hist.body.data).toMatchObject({ attemptsCount: 3, bestScore: 8 });
    const gradedById = Object.fromEntries(
      (hist.body.data!.items as Row[]).map((i) => [i.id, i.graded])
    );
    expect(gradedById).toEqual({ [id1]: false, [id2]: true, [id3]: false });

    const detail = await get(`/api/v1/assignments/${asg.id}`, users.studentA);
    expect(detail.body.data).toMatchObject({ status: "SUBMITTED", attemptsUsed: 3, bestScore: 8 });

    // Hai dòng chưa chấm còn nguyên trong DB.
    const rows = await prisma.attempt.findMany({
      where: { studentId: users.studentA, assignmentId: asg.id },
      orderBy: { id: "asc" },
    });
    expect(rows.map((r) => r.score)).toEqual([null, 8, null]);
  });

  it("bài giao TRƯỚC due_at + lỗi AI: response không có answer/explanation (4c.4)", async () => {
    const asg = await newAssignment(24 * HOUR);
    gradeWritingMock.mockRejectedValue(new AIServiceError("AI_UNAVAILABLE", 2));
    const res = await post({ assignmentId: asg.id, answer: { text: ESSAY } }, users.studentA);
    expect(res.status).toBe(202);
    expect(res.body.data!.attempt).not.toHaveProperty("answer");
    expect(res.body.data!.attempt).not.toHaveProperty("explanation");
    expect(res.rawText).not.toContain(EXPLANATION);
  });

  it("nộp sau due_at + lỗi AI: is_late = true được lưu đúng lúc nộp, attempt vẫn chờ chấm", async () => {
    const asg = await newAssignment(-1 * HOUR);
    gradeWritingMock.mockRejectedValue(new AIServiceError("TIMEOUT", 1));
    const res = await post({ assignmentId: asg.id, answer: { text: ESSAY } }, users.studentA);
    expect(res.status).toBe(202);
    const row = await prisma.attempt.findUnique({ where: { id: res.body.data!.attemptId } });
    expect(row).toMatchObject({ isLate: true, score: null, aiFeedback: null, errors: [] });
    expect(row!.submittedAt).toBeInstanceOf(Date);
  });
});