/**
 * T13 · "áp dụng lại quy tắc lộ đáp án/giới hạn 3 lần" · Bước 2: giới hạn 3 lần cho WRITING.
 *
 * HTTP + PostgreSQL thật, gradeWriting được MOCK (KHÔNG gọi AI thật). Chỉ thêm các ca CHƯA có ở
 * attempts-limit / attempts-writing-grade / attempts-ai-error / attempts-writing:
 *  - nộp song song ở bài giao writing: đúng tối đa 3 dòng, provider chỉ được gọi cho các lần đã lưu;
 *  - hai HS cùng nộp song song: mỗi người đếm riêng;
 *  - một HS, hai bài giao khác nhau + tự luyện: đếm riêng, không ảnh hưởng nhau;
 *  - không log nội dung bài viết; response không chứa field bí mật.
 *
 * Tiền tố "t13l_" riêng để không xóa nhầm dữ liệu của test khác; dữ liệu tự tạo, tự dọn.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { inspect } from "node:util";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { MAX_ATTEMPTS_PER_ASSIGNMENT } from "./attempts.constants";

const { gradeWritingMock } = vi.hoisted(() => ({ gradeWritingMock: vi.fn() }));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: gradeWritingMock }));

const PREFIX = "t13l_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const AI_ERROR = {
  type: "grammar:tense",
  text: "I goes",
  correction: "I usually go",
  explanation: "Chủ ngữ I dùng động từ nguyên mẫu.",
};
const FAKE_GRADE = {
  criteria: { content: 7, coherence: 7, vocabulary: 7, grammar: 8 },
  comment: "Bài viết khá tốt.",
  errors: [AI_ERROR],
};

const users = { teacher: 0, studentA: 0, studentB: 0 };
const tokens = { studentA: "", studentB: "" };
const ids = { classId: 0, writing: 0 };

let server: Server;
let baseUrl = "";

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
  await prisma.class.deleteMany({ where: { teacherId: { in: userIds } } }); // kéo theo assignments, members
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
  users.studentB = await createUser("student_b", "STUDENT");
  tokens.studentA = jwt.sign({ userId: users.studentA }, env.JWT_SECRET);
  tokens.studentB = jwt.sign({ userId: users.studentB }, env.JWT_SECRET);

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

  // Bài writing vừa là bài thư viện (để tự luyện) vừa dùng cho bài giao.
  ids.writing = (
    await prisma.exercise.create({
      data: {
        type: "writing",
        skill: "WRITING",
        level: "A2",
        topic: `${RUN_ID} writing`,
        content: { prompt: "Write about your day", minWords: 1 },
        answer: undefined,
        explanation: "Gợi ý của GV t13l.",
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
  // Chờ một chút để các request song song thật sự chồng lên nhau trong lúc "gọi AI".
  gradeWritingMock.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return structuredClone(FAKE_GRADE);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const call = async (method: "GET" | "POST", path: string, token: string, body?: unknown) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) as { data: Row | null; error: Row | null } };
};

const submitAssignment = (assignmentId: number, token: string, text = "I goes to school.") =>
  call("POST", "/api/v1/attempts", token, { assignmentId, answer: { text } });

const submitPractice = (token: string, text = "I goes to school.") =>
  call("POST", "/api/v1/attempts", token, { exerciseId: ids.writing, answer: { text } });

const newAssignment = async () =>
  (
    await prisma.assignment.create({
      data: {
        exerciseId: ids.writing,
        classId: ids.classId,
        assignedById: users.teacher,
        dueAt: new Date(Date.now() + HOUR),
      },
      select: { id: true },
    })
  ).id;

const countRows = (studentId: number, assignmentId: number) =>
  prisma.attempt.count({ where: { studentId, assignmentId } });

describe("Giới hạn 3 lần cho writing: nộp song song", () => {
  it("4 request song song cùng một HS: đúng 3 x 201 + 1 x 409; DB đúng 3 dòng; provider gọi đúng 3 lần", async () => {
    const a = await newAssignment();

    const results = await Promise.all(
      Array.from({ length: 4 }, () => submitAssignment(a, tokens.studentA))
    );

    // Không có 500 hay mã lạ: chỉ 201 và 409
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 409]);

    const ok = results.filter((r) => r.status === 201);
    expect(ok.map((r) => Number(r.body.data?.attemptNo)).sort((x, y) => x - y)).toEqual([1, 2, 3]);
    expect(ok.map((r) => Number(r.body.data?.attemptsLeft)).sort((x, y) => x - y)).toEqual([0, 1, 2]);

    const rejected = results.find((r) => r.status === 409)!;
    expect(rejected.body.error?.code).toBe("ATTEMPT_LIMIT_REACHED");
    expect(rejected.body.data).toBeNull();

    // DB đúng 3 dòng, không có dòng thứ 4
    expect(await countRows(users.studentA, a)).toBe(MAX_ATTEMPTS_PER_ASSIGNMENT);
    // Lần bị từ chối KHÔNG tốn lượt AI: provider chỉ được gọi cho 3 lần đã lưu
    expect(gradeWritingMock).toHaveBeenCalledTimes(MAX_ATTEMPTS_PER_ASSIGNMENT);

    // Cả 3 lần đã lưu đều được chấm (không dòng nào kẹt score NULL)
    const rows = await prisma.attempt.findMany({
      where: { studentId: users.studentA, assignmentId: a },
      select: { score: true },
    });
    expect(rows.every((r: { score: number | null }) => r.score !== null)).toBe(true);
  });

  it("hai HS cùng nộp song song (mỗi HS 4 request): mỗi HS đúng 3 dòng, provider gọi đúng 6 lần", async () => {
    const a = await newAssignment();

    const results = await Promise.all([
      ...Array.from({ length: 4 }, () => submitAssignment(a, tokens.studentA)),
      ...Array.from({ length: 4 }, () => submitAssignment(a, tokens.studentB)),
    ]);

    const statuses = (from: number, to: number) =>
      results.slice(from, to).map((r) => r.status).sort();
    expect(statuses(0, 4)).toEqual([201, 201, 201, 409]); // HS A
    expect(statuses(4, 8)).toEqual([201, 201, 201, 409]); // HS B

    expect(await countRows(users.studentA, a)).toBe(3);
    expect(await countRows(users.studentB, a)).toBe(3);
    expect(gradeWritingMock).toHaveBeenCalledTimes(6);
  });
});

describe("Giới hạn 3 lần cho writing: đếm riêng từng (HS, bài giao)", () => {
  it("một HS, hai bài giao khác nhau (cùng đề) + tự luyện: không ảnh hưởng nhau", async () => {
    const a1 = await newAssignment();
    const a2 = await newAssignment();

    // Dùng hết 3 lần ở bài giao 1
    for (let i = 1; i <= 3; i++) {
      const res = await submitAssignment(a1, tokens.studentA);
      expect(res.status).toBe(201);
      expect(res.body.data!.attemptNo).toBe(i);
    }
    const fourth = await submitAssignment(a1, tokens.studentA);
    expect(fourth.status).toBe(409);
    expect(fourth.body.error?.code).toBe("ATTEMPT_LIMIT_REACHED");
    expect(gradeWritingMock).toHaveBeenCalledTimes(3);

    // Bài giao 2: vẫn là lần 1, còn đủ 2 lần
    const first = await submitAssignment(a2, tokens.studentA);
    expect(first.status).toBe(201);
    expect(first.body.data!.attemptNo).toBe(1);
    expect(first.body.data!.attemptsLeft).toBe(2);

    // Tự luyện cùng đề: không giới hạn và không có attemptsLeft
    const practice = await submitPractice(tokens.studentA);
    expect(practice.status).toBe(201);
    expect("attemptsLeft" in practice.body.data!).toBe(false);

    // HS B chưa nộp gì ở bài giao 1: vẫn là lần 1
    const other = await submitAssignment(a1, tokens.studentB);
    expect(other.status).toBe(201);
    expect(other.body.data!.attemptNo).toBe(1);

    // Số dòng trong DB đúng từng nhóm
    expect(await countRows(users.studentA, a1)).toBe(3);
    expect(await countRows(users.studentA, a2)).toBe(1);
    expect(await countRows(users.studentB, a1)).toBe(1);

    // Lịch sử lọc theo bài giao cũng đếm riêng
    const h1 = await call("GET", `/api/v1/attempts?assignmentId=${a1}`, tokens.studentA);
    const h2 = await call("GET", `/api/v1/attempts?assignmentId=${a2}`, tokens.studentA);
    expect(h1.body.data!.attemptsCount).toBe(3);
    expect(h2.body.data!.attemptsCount).toBe(1);
  });
});

describe("Writing: không log nội dung bài, không lộ field bí mật", () => {
  it("POST (bài giao và tự luyện) + 409: console không chứa bài viết; response không chứa secrets", async () => {
    const a = await newAssignment();
    const MARKER = `${RUN_ID}_noi_dung_rieng_tu`;
    const text = `I goes to school. ${MARKER}`;

    // Chỉ log bằng console (server không dùng morgan/pino): bắt mọi lời gọi console.
    const logged: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((x) => (typeof x === "string" ? x : inspect(x, { depth: 4 }))).join(" "));
      });
    }

    const responses = [
      ...(await Promise.all([1, 2, 3, 4].map(() => submitAssignment(a, tokens.studentA, text)))),
      await submitPractice(tokens.studentA, text),
    ];
    expect(responses.map((r) => r.status).sort()).toEqual([201, 201, 201, 201, 409]);

    for (const res of responses) {
      expect(res.rawText).not.toContain("passwordHash");
      expect(res.rawText).not.toContain(env.JWT_SECRET);
      if (env.GEMINI_API_KEY) expect(res.rawText).not.toContain(env.GEMINI_API_KEY);
      // Response nộp bài không chép lại bài viết
      expect(res.rawText).not.toContain(MARKER);
    }
    expect(logged.join("\n")).not.toContain(MARKER);
  });
});