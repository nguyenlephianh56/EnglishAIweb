/**
 * T13 · "áp dụng lại quy tắc lộ đáp án/giới hạn 3 lần" · Bước 1: MỐC due_at cho writing.
 *
 * Phần 1 (thuần, không DB): isPastDue / isAnswerRevealed / computeStatus cùng một ranh giới.
 * Phần 2 (HTTP + PostgreSQL thật, gradeWriting được MOCK, KHÔNG gọi AI thật): đồng hồ giả
 * (chỉ giả `Date`) đặt đúng tại due_at và due_at + 1ms, kiểm POST /attempts, GET /attempts/:id,
 * GET /assignments/:id và GET /assignments của HS.
 *
 * Tiền tố "t13d_" riêng để không xóa nhầm dữ liệu của test khác; dữ liệu tự tạo, tự dọn.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { isAnswerRevealed, isPastDue } from "./attempts-detail";
import { computeStatus } from "../assignments/assignments-view";

const { gradeWritingMock } = vi.hoisted(() => ({ gradeWritingMock: vi.fn() }));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: gradeWritingMock }));

// ---------------------------------------------------------------------------
// Phần 1: hàm thuần
// ---------------------------------------------------------------------------
describe("isPastDue / isAnswerRevealed / computeStatus: cùng một ranh giới", () => {
  const due = new Date("2026-11-20T10:00:00.000Z");
  const before = new Date(due.getTime() - 1);
  const after = new Date(due.getTime() + 1);

  it("isPastDue: trước hạn false, ĐÚNG hạn false, sau hạn 1ms true", () => {
    expect(isPastDue(due, before)).toBe(false);
    expect(isPastDue(due, new Date(due.getTime()))).toBe(false);
    expect(isPastDue(due, after)).toBe(true);
  });

  it("isAnswerRevealed: tự luyện luôn lộ; bài giao chỉ lộ khi isPastDue", () => {
    expect(isAnswerRevealed(null, null, before)).toBe(true);
    expect(isAnswerRevealed(1, due, before)).toBe(false);
    expect(isAnswerRevealed(1, due, new Date(due.getTime()))).toBe(false);
    expect(isAnswerRevealed(1, due, after)).toBe(true);
  });

  it("isAnswerRevealed: bài giao không rõ hạn (dueAt null) -> KHÔNG lộ", () => {
    expect(isAnswerRevealed(1, null, after)).toBe(false);
  });

  it("computeStatus (chưa nộp): đúng hạn vẫn NOT_STARTED, +1ms là OVERDUE; đã nộp luôn SUBMITTED", () => {
    expect(computeStatus(0, due, new Date(due.getTime()))).toBe("NOT_STARTED");
    expect(computeStatus(0, due, after)).toBe("OVERDUE");
    expect(computeStatus(1, due, after)).toBe("SUBMITTED");
  });

  it("ba hàm khớp nhau ở mọi mốc: lộ <=> quá hạn <=> OVERDUE (khi chưa nộp)", () => {
    for (const offset of [-1000, -1, 0, 1, 1000]) {
      const now = new Date(due.getTime() + offset);
      const past = isPastDue(due, now);
      expect(isAnswerRevealed(7, due, now)).toBe(past);
      expect(computeStatus(0, due, now) === "OVERDUE").toBe(past);
    }
  });
});

// ---------------------------------------------------------------------------
// Phần 2: tích hợp (writing, bài giao)
// ---------------------------------------------------------------------------
const PREFIX = "t13d_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;
const EXPLANATION = "Gợi ý của GV cho bài viết t13d.";

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

const users = { teacher: 0, studentA: 0 };
const ids = { classId: 0, writing: 0 };
let tokenA = "";
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
  // Ký token MỘT lần ở giờ thật, để đồng hồ giả không ảnh hưởng tới iat của token.
  tokenA = jwt.sign({ userId: users.studentA }, env.JWT_SECRET);

  ids.classId = (
    await prisma.class.create({
      data: { name: `${RUN_ID} class`, code: randomClassCode(), teacherId: users.teacher },
      select: { id: true },
    })
  ).id;
  await prisma.classMember.create({ data: { classId: ids.classId, studentId: users.studentA } });

  ids.writing = (
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
  vi.useRealTimers();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanup(Object.values(users).filter((id) => id > 0));
  await prisma.$disconnect();
});

beforeEach(() => {
  gradeWritingMock.mockReset();
  gradeWritingMock.mockImplementation(async () => structuredClone(FAKE_GRADE));
});

afterEach(() => {
  vi.useRealTimers();
});

const call = async (method: "GET" | "POST", path: string, body?: unknown) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) as { data: Row | null; error: Row | null } };
};

/** Tạo bài giao với hạn CỐ ĐỊNH (làm tròn giây) để đặt đồng hồ giả đúng vào due_at. */
const newAssignment = async () => {
  const dueAt = new Date(Math.floor((Date.now() + HOUR) / 1000) * 1000);
  const row = await prisma.assignment.create({
    data: {
      exerciseId: ids.writing,
      classId: ids.classId,
      assignedById: users.teacher,
      dueAt,
    },
    select: { id: true },
  });
  return { id: row.id, dueAt };
};

/** Chỉ giả `Date`; setTimeout/Promise/IO vẫn thật nên server và DB chạy bình thường. */
const setClock = (at: Date) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
};

describe("writing bài giao: ranh giới due_at (đồng hồ giả)", () => {
  it("nộp ĐÚNG due_at: chưa trễ, chưa lộ; GET chi tiết đúng due_at vẫn ẩn; due_at + 1ms thì lộ đủ", async () => {
    const a = await newAssignment();

    setClock(a.dueAt);
    const posted = await call("POST", "/api/v1/attempts", {
      assignmentId: a.id,
      answer: { text: "I goes to school." },
    });
    expect(posted.status).toBe(201);
    const d = posted.body.data!;
    // (b): vẫn thấy điểm, criteria, comment; chỉ ẩn correction/explanation
    expect(d.score).toBe(7.25);
    expect(d.criteria).toEqual(FAKE_GRADE.criteria);
    expect(d.comment).toBe(FAKE_GRADE.comment);
    expect(d.errors).toEqual([{ type: AI_ERROR.type, text: AI_ERROR.text }]);
    expect("answer" in d).toBe(false);
    expect("explanation" in d).toBe(false);
    expect(posted.rawText).not.toContain(AI_ERROR.correction);
    expect(posted.rawText).not.toContain(AI_ERROR.explanation);
    expect(posted.rawText).not.toContain(EXPLANATION);
    // is_late = nộp > due_at: đúng bằng due_at thì KHÔNG trễ
    const row = await prisma.attempt.findUnique({ where: { id: d.attemptId } });
    expect(row!.isLate).toBe(false);

    // Vẫn đúng due_at: GET chi tiết còn ẩn
    const atDue = await call("GET", `/api/v1/attempts/${d.attemptId}`);
    expect(atDue.status).toBe(200);
    expect(atDue.body.data!.errors).toEqual([{ type: AI_ERROR.type, text: AI_ERROR.text }]);
    expect("answer" in atDue.body.data!).toBe(false);
    expect("explanation" in atDue.body.data!).toBe(false);

    // due_at + 1ms: lộ đủ
    setClock(new Date(a.dueAt.getTime() + 1));
    const afterDue = await call("GET", `/api/v1/attempts/${d.attemptId}`);
    expect(afterDue.status).toBe(200);
    expect(afterDue.body.data!.errors).toEqual([AI_ERROR]);
    expect(afterDue.body.data!.explanation).toBe(EXPLANATION);
    expect("answer" in afterDue.body.data!).toBe(false); // writing: không bao giờ có answer
    expect(afterDue.body.data!.criteria).toEqual(FAKE_GRADE.criteria);
    expect(afterDue.body.data!.comment).toBe(FAKE_GRADE.comment);
  });

  it("nộp due_at + 1ms: is_late = true và lộ đủ ngay trong POST", async () => {
    const a = await newAssignment();

    setClock(new Date(a.dueAt.getTime() + 1));
    const posted = await call("POST", "/api/v1/attempts", {
      assignmentId: a.id,
      answer: { text: "I goes to school." },
    });
    expect(posted.status).toBe(201);
    expect(posted.body.data!.errors).toEqual([AI_ERROR]);
    expect(posted.body.data!.explanation).toBe(EXPLANATION);
    expect("answer" in posted.body.data!).toBe(false);

    const row = await prisma.attempt.findUnique({ where: { id: posted.body.data!.attemptId } });
    expect(row!.isLate).toBe(true);
  });
});

describe("GET bài giao của HS (writing): explanation theo due_at, không bao giờ có answer", () => {
  it("chi tiết: đúng due_at không có key explanation; +1ms có explanation; luôn không có answer", async () => {
    const a = await newAssignment();

    setClock(a.dueAt);
    const atDue = await call("GET", `/api/v1/assignments/${a.id}`);
    expect(atDue.status).toBe(200);
    expect("answer" in atDue.body.data!.exercise).toBe(false);
    expect("explanation" in atDue.body.data!.exercise).toBe(false);
    expect(atDue.rawText).not.toContain(EXPLANATION);
    expect(atDue.body.data!.status).toBe("NOT_STARTED");

    setClock(new Date(a.dueAt.getTime() + 1));
    const afterDue = await call("GET", `/api/v1/assignments/${a.id}`);
    expect(afterDue.status).toBe(200);
    expect("answer" in afterDue.body.data!.exercise).toBe(false);
    expect(afterDue.body.data!.exercise.explanation).toBe(EXPLANATION);
    expect(afterDue.body.data!.status).toBe("OVERDUE");
  });

  it("danh sách: không có content/answer/explanation; status đổi NOT_STARTED -> OVERDUE đúng sau due_at", async () => {
    const a = await newAssignment();
    const statusOf = async () => {
      const res = await call("GET", "/api/v1/assignments?limit=50");
      expect(res.status).toBe(200);
      const item = (res.body.data!.items as Row[]).find((i) => i.assignmentId === a.id);
      expect(item).toBeDefined();
      expect("answer" in item!.exercise).toBe(false);
      expect("explanation" in item!.exercise).toBe(false);
      expect("content" in item!.exercise).toBe(false);
      return item!.status as string;
    };

    setClock(a.dueAt);
    expect(await statusOf()).toBe("NOT_STARTED");
    setClock(new Date(a.dueAt.getTime() + 1));
    expect(await statusOf()).toBe("OVERDUE");
  });
});