/**
 * Test tích hợp (HTTP + PostgreSQL thật, KHÔNG gọi AI): nộp bài writing lưu CHỜ CHẤM (T13, dòng 1).
 *
 * Phủ: nộp tự luyện/bài giao, kiểm answer {text}, giới hạn 3 lần, trễ hạn, quyền truy cập,
 * điểm NULL ở lịch sử / trạng thái bài giao / danh sách bài nộp của GV, không lộ dữ liệu nhạy cảm.
 *
 * - Tiền tố "t13w_" riêng để không xóa nhầm dữ liệu của test khác.
 * - Tự tạo user/lớp/bài/assignment riêng, xóa sạch sau khi chạy.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { inspect } from "node:util";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { MAX_ATTEMPTS_PER_ASSIGNMENT, WRITING_TEXT_MAX } from "./attempts.constants";

// T13: POST writing giờ gọi AI chấm. Test này KHÔNG gọi AI thật: gradeWriting luôn trả kết quả cố định.
// (7+7+7+8)/4 = 7.25. Ca AI lỗi / chấm song song nằm ở attempts-writing-grade.test.ts.
const { FAKE_GRADE } = vi.hoisted(() => ({
  FAKE_GRADE: {
    criteria: { content: 7, coherence: 7, vocabulary: 7, grammar: 8 },
    comment: "Bài viết khá tốt.",
    errors: [
      {
        type: "grammar:tense",
        text: "I goes",
        correction: "I go",
        explanation: "Chủ ngữ I dùng động từ nguyên mẫu.",
      },
    ],
  },
}));
vi.mock("../../ai/writingGrader", () => ({
  gradeWriting: async () => structuredClone(FAKE_GRADE),
}));
const FAKE_SCORE = 7.25;
const FAKE_AI_FEEDBACK = { criteria: FAKE_GRADE.criteria, comment: FAKE_GRADE.comment };

const PREFIX = "t13w_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;
const EXPLANATION = "Gợi ý của GV cho bài viết.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const users = { teacher: 0, teacher2: 0, studentA: 0, studentB: 0, outsider: 0 };
const ids = { classId: 0, writingLib: 0, writingDraft: 0 };

let server: Server;
let baseUrl = "";

// ---------------------------------------------------------------------------
// Tạo / dọn dữ liệu
// ---------------------------------------------------------------------------
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

const randomClassCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const newWriting = async (status: "PUBLISHED" | "DRAFT") => {
  const row = await prisma.exercise.create({
    data: {
      type: "writing",
      skill: "WRITING",
      level: "A2",
      topic: `${RUN_ID} writing ${status}`,
      content: { prompt: "Write about your day", minWords: 50 },
      answer: undefined, // writing: answer = NULL của SQL
      explanation: EXPLANATION,
      status,
      source: "TEACHER",
      inLibrary: status === "PUBLISHED",
      createdById: users.teacher,
    },
    select: { id: true },
  });
  return row.id;
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
  users.teacher2 = await createUser("teacher2", "TEACHER");
  users.studentA = await createUser("student_a", "STUDENT");
  users.studentB = await createUser("student_b", "STUDENT");
  users.outsider = await createUser("outsider", "STUDENT");

  const cls = await prisma.class.create({
    data: { name: `${RUN_ID} class`, code: randomClassCode(), teacherId: users.teacher },
    select: { id: true },
  });
  ids.classId = cls.id;
  await prisma.classMember.create({ data: { classId: ids.classId, studentId: users.studentA } });
  await prisma.classMember.create({ data: { classId: ids.classId, studentId: users.studentB } });

  ids.writingLib = await newWriting("PUBLISHED");
  ids.writingDraft = await newWriting("DRAFT");

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

// ---------------------------------------------------------------------------
// Hàm tiện ích
// ---------------------------------------------------------------------------
const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

interface ApiResult {
  status: number;
  rawText: string;
  body: {
    data: Row | null;
    error: { code: string; message: string; details?: Row } | null;
  };
}

const call = async (
  method: "GET" | "POST",
  path: string,
  userId?: number,
  body?: unknown
): Promise<ApiResult> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) };
};

const postAttempt = (body: unknown, userId?: number) =>
  call("POST", "/api/v1/attempts", userId, body);

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

const submitAsg = (assignmentId: number, text: string, userId: number) =>
  postAttempt({ assignmentId, answer: { text } }, userId);

const submitPractice = (text: string, userId: number, exerciseId = ids.writingLib) =>
  postAttempt({ exerciseId, answer: { text } }, userId);

// Dòng "chưa chấm" (score NULL) tạo thẳng bằng Prisma: POST giờ luôn chấm xong,
// còn các ca dưới đây kiểm cách GET/trạng thái bài giao xử lý điểm NULL.
const insertUngraded = async (assignmentId: number, studentId: number, text: string) =>
  (
    await prisma.attempt.create({
      data: {
        studentId,
        exerciseId: ids.writingLib,
        assignmentId,
        mode: "practice",
        answer: { text },
        score: null,
        maxScore: 10,
        errors: [],
      },
      select: { id: true },
    })
  ).id;

const countFor = (studentId: number) => prisma.attempt.count({ where: { studentId } });

// ---------------------------------------------------------------------------
// 1. Tự luyện
// ---------------------------------------------------------------------------
describe("POST /attempts - writing tự luyện", () => {
  it("nộp nhiều lần (5 lần) đều 201: tự luyện không giới hạn, không có attemptNo", async () => {
    const before = await countFor(users.studentA);
    for (let i = 0; i < MAX_ATTEMPTS_PER_ASSIGNMENT + 2; i++) {
      const res = await submitPractice(`Practice essay number ${i}`, users.studentA);
      expect(res.status).toBe(201);
      expect("attemptNo" in res.body.data!).toBe(false);
    }
    expect(await countFor(users.studentA)).toBe(before + MAX_ATTEMPTS_PER_ASSIGNMENT + 2);
  });

  it("lưu đúng dòng attempts; client gửi studentId/score/isLate/submittedAt ở ngoài bị bỏ qua", async () => {
    const res = await postAttempt(
      {
        exerciseId: ids.writingLib,
        answer: { text: "  My weekend was great.  " },
        studentId: users.studentB,
        score: 9.5,
        maxScore: 100,
        errors: [{ type: "grammar:tense", text: "x" }],
        aiFeedback: { comment: "gia" },
        teacherScore: 10,
        isLate: true,
        submittedAt: "2000-01-01T00:00:00.000Z",
      },
      users.studentA
    );
    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();

    const data = res.body.data!;
    expect(data.score).toBe(FAKE_SCORE); // điểm do server tính, không lấy score 9.5 của client
    expect(data.graded).toBe(true);
    expect(data.maxScore).toBe(10);
    expect(data.errors).toEqual(FAKE_GRADE.errors); // tự luyện: lộ đủ correction/explanation
    expect("answer" in data).toBe(false); // writing không có đáp án
    expect(data.explanation).toBe(EXPLANATION); // tự luyện: lộ ngay

    const row = await prisma.attempt.findUnique({ where: { id: data.attemptId as number } });
    expect(row).toMatchObject({
      studentId: users.studentA, // từ token, không phải studentB
      exerciseId: ids.writingLib,
      assignmentId: null,
      mode: "practice",
      score: FAKE_SCORE,
      maxScore: 10,
      errors: FAKE_GRADE.errors,
      aiFeedback: FAKE_AI_FEEDBACK,
      teacherScore: null,
      isLate: false,
    });
    expect(row!.answer).toEqual({ text: "My weekend was great." }); // đã trim
    expect(Math.abs(row!.submittedAt.getTime() - Date.now())).toBeLessThan(60 * 1000);
  });

  it("đúng trần ký tự -> 201; vượt trần 1 ký tự -> 400, không tạo attempt", async () => {
    const ok = await submitPractice("a".repeat(WRITING_TEXT_MAX), users.studentA);
    expect(ok.status).toBe(201);

    const before = await countFor(users.studentA);
    const tooLong = await submitPractice("a".repeat(WRITING_TEXT_MAX + 1), users.studentA);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error!.code).toBe("VALIDATION_ERROR");
    expect(tooLong.body.data).toBeNull();
    expect(await countFor(users.studentA)).toBe(before);
  });

  const BAD_ANSWERS: [string, unknown][] = [
    ["text rỗng", { text: "" }],
    ["text chỉ khoảng trắng", { text: "   \n\t  " }],
    ["thiếu text", {}],
    ["text là số", { text: 123 }],
    ["text là null", { text: null }],
    ["text là mảng", { text: ["a"] }],
    ["answer là chuỗi", "My essay"],
    ["answer là mảng chuỗi", ["My essay"]],
    ["answer là null", null],
    ["field thừa score trong answer", { text: "Hello", score: 10 }],
    ["field thừa is_late trong answer", { text: "Hello", is_late: false }],
    ["field thừa student_id trong answer", { text: "Hello", student_id: 1 }],
  ];

  it.each(BAD_ANSWERS)("answer sai hình dạng (%s) -> 400, không tạo attempt", async (_n, answer) => {
    const before = await countFor(users.studentA);
    const res = await postAttempt({ exerciseId: ids.writingLib, answer }, users.studentA);
    expect(res.status).toBe(400);
    expect(res.body.error!.code).toBe("VALIDATION_ERROR");
    expect(res.body.data).toBeNull();
    expect(await countFor(users.studentA)).toBe(before);
  });

  it("thiếu hẳn answer -> 400, không tạo attempt", async () => {
    const before = await countFor(users.studentA);
    const res = await postAttempt({ exerciseId: ids.writingLib }, users.studentA);
    expect(res.status).toBe(400);
    expect(await countFor(users.studentA)).toBe(before);
  });

  it("bài writing không công khai (DRAFT, không in_library) -> 404, không tạo attempt", async () => {
    const before = await countFor(users.studentA);
    const res = await submitPractice("Hello", users.studentA, ids.writingDraft);
    expect(res.status).toBe(404);
    expect(res.body.error!.code).toBe("NOT_FOUND");
    expect(await countFor(users.studentA)).toBe(before);
  });

  it("GV nộp bài -> 403, không tạo attempt", async () => {
    const res = await submitPractice("Hello", users.teacher);
    expect(res.status).toBe(403);
    expect(await countFor(users.teacher)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Bài giao: giới hạn 3 lần, trễ hạn, che giải thích trước hạn
// ---------------------------------------------------------------------------
describe("POST /attempts - writing bài giao", () => {
  it("lần 1-3 nhận (attemptNo, attemptsLeft đúng, lưu chờ chấm); lần 4 -> 409, không tạo dòng", async () => {
    const asg = await newAssignment(24 * HOUR);

    for (let n = 1; n <= MAX_ATTEMPTS_PER_ASSIGNMENT; n++) {
      const res = await submitAsg(asg.id, `Essay attempt ${n}`, users.studentA);
      expect(res.status).toBe(201);
      const data = res.body.data!;
      expect(data.attemptNo).toBe(n);
      expect(data.attemptsLeft).toBe(MAX_ATTEMPTS_PER_ASSIGNMENT - n);
      expect(data.score).toBe(FAKE_SCORE);
      expect(data.graded).toBe(true);
      // Chưa tới hạn: lỗi chỉ còn { type, text }, không lộ correction/explanation (4c.4)
      expect(data.errors).toEqual([{ type: "grammar:tense", text: "I goes" }]);
      expect("answer" in data).toBe(false);
      // Chưa tới hạn: che giải thích (4c.4)
      expect("explanation" in data).toBe(false);
    }

    const rows = await prisma.attempt.findMany({
      where: { studentId: users.studentA, assignmentId: asg.id },
      orderBy: { id: "asc" },
    });
    expect(rows).toHaveLength(MAX_ATTEMPTS_PER_ASSIGNMENT);
    for (const row of rows) {
      expect(row).toMatchObject({
        exerciseId: ids.writingLib,
        score: FAKE_SCORE,
        maxScore: 10,
        errors: FAKE_GRADE.errors, // DB lưu đủ; chỉ response mới che
        aiFeedback: FAKE_AI_FEEDBACK,
        isLate: false,
      });
    }

    const fourth = await submitAsg(asg.id, "Essay attempt 4", users.studentA);
    expect(fourth.status).toBe(409);
    expect(fourth.body.error!.code).toBe("ATTEMPT_LIMIT_REACHED");
    expect(fourth.body.data).toBeNull();
    expect(
      await prisma.attempt.count({ where: { studentId: users.studentA, assignmentId: asg.id } })
    ).toBe(MAX_ATTEMPTS_PER_ASSIGNMENT);
  });

  it("giới hạn tính riêng từng HS: A hết lượt thì B vẫn nộp được", async () => {
    const asg = await newAssignment(24 * HOUR);
    for (let n = 0; n < MAX_ATTEMPTS_PER_ASSIGNMENT; n++) {
      expect((await submitAsg(asg.id, `A ${n}`, users.studentA)).status).toBe(201);
    }
    expect((await submitAsg(asg.id, "A extra", users.studentA)).status).toBe(409);

    const b = await submitAsg(asg.id, "B first", users.studentB);
    expect(b.status).toBe(201);
    expect(b.body.data!.attemptNo).toBe(1);
  });

  it("nộp sau due_at vẫn nhận, is_late = true, và được lộ giải thích (vẫn không có answer)", async () => {
    const asg = await newAssignment(-1 * HOUR);
    const res = await submitAsg(asg.id, "Late essay", users.studentA);
    expect(res.status).toBe(201);
    expect(res.body.data!.score).toBe(FAKE_SCORE); // trễ hạn vẫn được chấm
    expect(res.body.data!.explanation).toBe(EXPLANATION);
    expect("answer" in res.body.data!).toBe(false);

    const row = await prisma.attempt.findUnique({ where: { id: res.body.data!.attemptId } });
    expect(row!.isLate).toBe(true);
    expect(row!.assignmentId).toBe(asg.id);
  });

  it("HS không thuộc lớp của bài giao -> 404, không tạo attempt", async () => {
    const asg = await newAssignment(24 * HOUR);
    const res = await submitAsg(asg.id, "Hello", users.outsider);
    expect(res.status).toBe(404);
    expect(res.body.error!.code).toBe("NOT_FOUND");
    expect(await countFor(users.outsider)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Quyền xem bài nộp
// ---------------------------------------------------------------------------
describe("Quyền xem bài nộp writing", () => {
  it("HS A không xem được bài nộp của HS B (404) và không thấy trong lịch sử của mình", async () => {
    const b = await submitPractice("B private essay", users.studentB);
    const bId = b.body.data!.attemptId as number;

    const asA = await call("GET", `/api/v1/attempts/${bId}`, users.studentA);
    expect(asA.status).toBe(404);
    expect(asA.rawText).not.toContain("B private essay");

    const listA = await call("GET", "/api/v1/attempts?limit=50", users.studentA);
    expect(listA.status).toBe(200);
    const idsA = (listA.body.data!.items as Row[]).map((i) => i.id);
    expect(idsA).not.toContain(bId);

    // Chính B xem được, kèm bài làm của mình
    const asB = await call("GET", `/api/v1/attempts/${bId}`, users.studentB);
    expect(asB.status).toBe(200);
    expect(asB.body.data!.submittedAnswer).toEqual({ text: "B private essay" });
  });

  it("GV khác (không phải chủ lớp) xem bài nộp của bài giao -> 404; HS -> 403", async () => {
    const asg = await newAssignment(24 * HOUR);
    await submitAsg(asg.id, "Hello", users.studentA);

    const other = await call("GET", `/api/v1/assignments/${asg.id}/submissions`, users.teacher2);
    expect(other.status).toBe(404);

    const student = await call("GET", `/api/v1/assignments/${asg.id}/submissions`, users.studentA);
    expect(student.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 4. Điểm NULL (chưa chấm) không làm vỡ các nơi đọc điểm (SQL thật)
// ---------------------------------------------------------------------------
describe("Điểm NULL: toàn bộ lần nộp chưa chấm", () => {
  let asgId = 0;
  const attemptIds: number[] = [];

  beforeAll(async () => {
    asgId = (await newAssignment(24 * HOUR)).id;
    for (let n = 1; n <= 2; n++) {
      attemptIds.push(await insertUngraded(asgId, users.studentA, `Ungraded ${n}`));
    }
  });

  it("GET /attempts?assignmentId: bestScore null (không phải 0), attemptsCount 2, mỗi dòng graded=false", async () => {
    const res = await call("GET", `/api/v1/attempts?assignmentId=${asgId}`, users.studentA);
    expect(res.status).toBe(200);
    const data = res.body.data!;
    expect(data.total).toBe(2);
    expect(data.attemptsCount).toBe(2);
    expect(data.bestScore).toBeNull();
    expect(data.items).toHaveLength(2);
    for (const item of data.items as Row[]) {
      expect(item.score).toBeNull();
      expect(item.teacherScore).toBeNull();
      expect(item.finalScore).toBeNull();
      expect(item.graded).toBe(false);
      expect(item.maxScore).toBe(10);
    }
    expect((data.items as Row[]).map((i) => i.attemptNo).sort()).toEqual([1, 2]);
  });

  it("GET /attempts không lọc vẫn 200 khi có dòng điểm NULL", async () => {
    const res = await call("GET", "/api/v1/attempts?limit=50", users.studentA);
    expect(res.status).toBe(200);
    expect(res.body.data!.bestScore).toBeNull(); // không lọc thì không có điểm cao nhất
  });

  it("GET /attempts/:id: graded=false, finalScore null, trả đúng bài làm của HS", async () => {
    const res = await call("GET", `/api/v1/attempts/${attemptIds[0]}`, users.studentA);
    expect(res.status).toBe(200);
    const d = res.body.data!;
    expect(d.graded).toBe(false);
    expect(d.score).toBeNull();
    expect(d.finalScore).toBeNull();
    expect(d.errors).toEqual([]);
    expect(d.submittedAnswer).toEqual({ text: "Ungraded 1" });
    expect(d.attemptNo).toBe(1);
  });

  it("trạng thái bài giao của HS: SUBMITTED, 2/3, bestScore null (danh sách, lọc status, chi tiết)", async () => {
    const list = await call("GET", "/api/v1/assignments?limit=50", users.studentA);
    expect(list.status).toBe(200);
    const item = (list.body.data!.items as Row[]).find((i) => i.assignmentId === asgId)!;
    expect(item.status).toBe("SUBMITTED");
    expect(item.attemptsUsed).toBe(2);
    expect(item.maxAttempts).toBe(MAX_ATTEMPTS_PER_ASSIGNMENT);
    expect(item.bestScore).toBeNull();
    expect(item.lateSubmission).toBe(false);

    const filtered = await call("GET", "/api/v1/assignments?status=SUBMITTED&limit=50", users.studentA);
    expect((filtered.body.data!.items as Row[]).map((i) => i.assignmentId)).toContain(asgId);

    const detail = await call("GET", `/api/v1/assignments/${asgId}`, users.studentA);
    expect(detail.status).toBe(200);
    expect(detail.body.data!.status).toBe("SUBMITTED");
    expect(detail.body.data!.attemptsUsed).toBe(2);
    expect(detail.body.data!.bestScore).toBeNull();
    expect("answer" in detail.body.data!.exercise).toBe(false);
  });

  it("GV vẫn thấy bài nộp: SUBMITTED, bestScore null, bestAttemptId null; HS chưa nộp là NOT_STARTED", async () => {
    const res = await call("GET", `/api/v1/assignments/${asgId}/submissions`, users.teacher);
    expect(res.status).toBe(200);
    const data = res.body.data!;
    expect(data.totalStudents).toBe(2);
    expect(data.submittedCount).toBe(1);

    const a = (data.items as Row[]).find((i) => i.studentId === users.studentA)!;
    expect(a.status).toBe("SUBMITTED");
    expect(a.attemptsUsed).toBe(2);
    expect(a.bestScore).toBeNull();
    expect(a.bestAttemptId).toBeNull();
    expect(a.lastSubmittedAt).not.toBeNull();

    const b = (data.items as Row[]).find((i) => i.studentId === users.studentB)!;
    expect(b.status).toBe("NOT_STARTED");
    expect(b.attemptsUsed).toBe(0);
    expect(b.bestScore).toBeNull();
  });
});

describe("Điểm NULL lẫn điểm đã có (GV chấm tay)", () => {
  let asgId = 0;
  let g1 = 0; // A, chưa chấm
  let g2 = 0; // A, GV chấm 7
  let b1 = 0; // B, GV chấm 0

  beforeAll(async () => {
    asgId = (await newAssignment(24 * HOUR)).id;
    g1 = await insertUngraded(asgId, users.studentA, "A first");
    g2 = await insertUngraded(asgId, users.studentA, "A second");
    b1 = await insertUngraded(asgId, users.studentB, "B only");
    await prisma.attempt.update({ where: { id: g2 }, data: { teacherScore: 7 } });
    await prisma.attempt.update({ where: { id: b1 }, data: { teacherScore: 0 } });
  });

  it("lịch sử của A: điểm cao nhất bỏ qua lần chưa chấm (=7), lần chưa chấm vẫn graded=false", async () => {
    const res = await call("GET", `/api/v1/attempts?assignmentId=${asgId}`, users.studentA);
    expect(res.status).toBe(200);
    const data = res.body.data!;
    expect(data.bestScore).toBe(7);
    expect(data.attemptsCount).toBe(2);
    const items = data.items as Row[];
    const i1 = items.find((i) => i.id === g1)!;
    const i2 = items.find((i) => i.id === g2)!;
    expect(i1).toMatchObject({ graded: false, finalScore: null, score: null });
    expect(i2).toMatchObject({ graded: true, finalScore: 7, teacherScore: 7, score: null });
  });

  it("lịch sử của B: teacher_score = 0 là điểm thật (bestScore 0, không phải null)", async () => {
    const res = await call("GET", `/api/v1/attempts?assignmentId=${asgId}`, users.studentB);
    expect(res.body.data!.bestScore).toBe(0);
    expect((res.body.data!.items as Row[])[0]).toMatchObject({ graded: true, finalScore: 0 });
  });

  it("GV thấy bestScore + bestAttemptId đúng lần có điểm; điểm 0 không bị coi là NULL", async () => {
    const res = await call("GET", `/api/v1/assignments/${asgId}/submissions`, users.teacher);
    expect(res.status).toBe(200);
    const items = res.body.data!.items as Row[];
    const a = items.find((i) => i.studentId === users.studentA)!;
    const b = items.find((i) => i.studentId === users.studentB)!;
    expect(a).toMatchObject({ status: "SUBMITTED", attemptsUsed: 2, bestScore: 7, bestAttemptId: g2 });
    expect(b).toMatchObject({ status: "SUBMITTED", attemptsUsed: 1, bestScore: 0, bestAttemptId: b1 });
  });

  it("trạng thái bài giao của HS: bestScore khớp (A=7, B=0)", async () => {
    const find = async (userId: number) => {
      const list = await call("GET", "/api/v1/assignments?limit=50", userId);
      return (list.body.data!.items as Row[]).find((i) => i.assignmentId === asgId)!;
    };
    expect(await find(users.studentA)).toMatchObject({ status: "SUBMITTED", attemptsUsed: 2, bestScore: 7 });
    expect(await find(users.studentB)).toMatchObject({ status: "SUBMITTED", attemptsUsed: 1, bestScore: 0 });
  });
});

// ---------------------------------------------------------------------------
// 5. Không lộ dữ liệu nhạy cảm, không log nội dung bài viết
// ---------------------------------------------------------------------------
describe("Bảo mật: response và log", () => {
  const MARKER = `BAI_LAM_RIENG_TU_${Math.floor(Math.random() * 1e9)}`;

  const forbidden = () => {
    const words = ["passwordHash", "not-a-real-hash", env.JWT_SECRET];
    if (env.GEMINI_API_KEY) words.push(env.GEMINI_API_KEY);
    return words;
  };

  it("response nộp bài / chi tiết / lịch sử / danh sách GV không chứa passwordHash, JWT_SECRET, GEMINI_API_KEY", async () => {
    const asg = await newAssignment(24 * HOUR);
    const submitted = await submitAsg(asg.id, `Essay ${MARKER}`, users.studentA);
    expect(submitted.status).toBe(201);
    const attemptId = submitted.body.data!.attemptId as number;

    const responses = [
      submitted,
      await call("GET", `/api/v1/attempts/${attemptId}`, users.studentA),
      await call("GET", `/api/v1/attempts?assignmentId=${asg.id}`, users.studentA),
      await call("GET", "/api/v1/assignments?limit=50", users.studentA),
      await call("GET", `/api/v1/assignments/${asg.id}/submissions`, users.teacher),
    ];
    for (const res of responses) {
      for (const word of forbidden()) expect(res.rawText).not.toContain(word);
    }

    // Bài làm chỉ trả cho đúng HS (chi tiết), không lọt vào lịch sử hay danh sách GV
    expect(responses[1].rawText).toContain(MARKER);
    expect(responses[2].rawText).not.toContain(MARKER);
    expect(responses[4].rawText).not.toContain(MARKER);
  });

  it("không log nội dung bài viết (cả khi nộp thành công lẫn khi bị 400)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );
    try {
      const asg = await newAssignment(24 * HOUR);
      const ok = await submitAsg(asg.id, `Logged? ${MARKER}`, users.studentB);
      expect(ok.status).toBe(201);

      const bad = await postAttempt(
        { assignmentId: asg.id, answer: { text: `Bad ${MARKER}`, score: 10 } },
        users.studentB
      );
      expect(bad.status).toBe(400);
      expect(bad.rawText).not.toContain(MARKER); // lỗi 400 không chép lại bài viết

      const logged = spies.flatMap((spy) => spy.mock.calls).map((args) => inspect(args, { depth: 6 }));
      for (const line of logged) expect(line).not.toContain(MARKER);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});