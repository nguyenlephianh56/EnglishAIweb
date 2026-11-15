/**
 * Test tích hợp (HTTP + PostgreSQL thật, gradeWriting được MOCK, KHÔNG gọi AI thật):
 * nối chấm AI vào POST /attempts cho bài writing (T13, dòng "điểm tổng ... lưu score, ai_feedback, errors").
 *
 * - Tiền tố "t13g_" riêng để không xóa nhầm dữ liệu của test khác.
 * - Tự tạo user/lớp/bài/assignment riêng, xóa sạch sau khi chạy.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AIQuotaExceededError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { MAX_ATTEMPTS_PER_ASSIGNMENT } from "./attempts.constants";
import { gradeWritingAttempt } from "./attempts-writing-grade";

const { gradeWritingMock } = vi.hoisted(() => ({ gradeWritingMock: vi.fn() }));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: gradeWritingMock }));

const PREFIX = "t13g_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const users = { teacher: 0, studentA: 0 };
const ids = { classId: 0, writingLib: 0, fillBlank: 0 };

let server: Server;
let baseUrl = "";

const grade = (c: [number, number, number, number], errors: Row[] = [], comment = "Bài viết ổn.") => ({
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
        content: { prompt: "Write about your day", minWords: 50 },
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
  return { status: res.status, rawText, body: JSON.parse(rawText) as { data: Row | null; error: Row | null } };
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

describe("POST /attempts - writing tự luyện được chấm", () => {
  it("201: score = trung bình 4 tiêu chí; DB có score, ai_feedback {criteria, comment}, errors; max_score 10", async () => {
    gradeWritingMock.mockResolvedValue(grade([6.5, 7, 7, 7], [AI_ERROR], "Nhận xét tiếng Việt."));

    const res = await post({ exerciseId: ids.writingLib, answer: { text: "  I goes to school.  " } }, users.studentA);
    expect(res.status).toBe(201);
    expect(res.body.data!.score).toBe(6.88); // (6.5+7+7+7)/4 = 6.875 -> 6.88
    expect(res.body.data!.graded).toBe(true);
    expect(res.body.data!.maxScore).toBe(10);
    expect(res.body.data!.errors).toEqual([AI_ERROR]); // tự luyện: lộ đủ correction/explanation
    // HS thấy ngay criteria + comment (đúng khuôn 4b), không lộ ai_feedback thô
    expect(res.body.data!.criteria).toEqual({ content: 6.5, coherence: 7, vocabulary: 7, grammar: 7 });
    expect(res.body.data!.comment).toBe("Nhận xét tiếng Việt.");
    expect(res.body.data!.aiFeedback).toBeUndefined();

    const row = await prisma.attempt.findUnique({ where: { id: res.body.data!.attemptId } });
    expect(row!.score).toBe(6.88);
    expect(row!.maxScore).toBe(10);
    expect(row!.errors).toEqual([AI_ERROR]);
    // Đúng khuôn 4b, không lưu thêm gì
    expect(row!.aiFeedback).toEqual({
      criteria: { content: 6.5, coherence: 7, vocabulary: 7, grammar: 7 },
      comment: "Nhận xét tiếng Việt.",
    });
    expect(row!.teacherScore).toBeNull();

    // Server tự đưa dữ liệu cho AI: userId/role từ token, bài đã trim, đề + level từ DB
    expect(gradeWritingMock).toHaveBeenCalledTimes(1);
    expect(gradeWritingMock).toHaveBeenCalledWith({
      userId: users.studentA,
      role: "STUDENT",
      text: "I goes to school.",
      prompt: "Write about your day",
      minWords: 50,
      level: "A2",
    });
  });

  it("errors rỗng vẫn hợp lệ", async () => {
    gradeWritingMock.mockResolvedValue(grade([9, 9, 9, 9], []));
    const res = await post({ exerciseId: ids.writingLib, answer: { text: "A perfect essay." } }, users.studentA);
    expect(res.status).toBe(201);
    expect(res.body.data!.score).toBe(9);
    expect(res.body.data!.errors).toEqual([]);
    const row = await prisma.attempt.findUnique({ where: { id: res.body.data!.attemptId } });
    expect(row!.errors).toEqual([]);
    expect(row!.score).toBe(9);
  });

  it("client gửi score/errors/aiFeedback/teacherScore thì bị bỏ: DB chỉ có kết quả của AI", async () => {
    gradeWritingMock.mockResolvedValue(grade([5, 5, 5, 5], [], "Kết quả thật."));
    const res = await post(
      {
        exerciseId: ids.writingLib,
        answer: { text: "My essay." },
        score: 10,
        errors: [{ type: "x", text: "y" }],
        aiFeedback: { comment: "gia" },
        teacherScore: 10,
      },
      users.studentA
    );
    expect(res.status).toBe(201);
    const row = await prisma.attempt.findUnique({ where: { id: res.body.data!.attemptId } });
    expect(row).toMatchObject({ score: 5, errors: [], teacherScore: null });
    expect((row!.aiFeedback as Row).comment).toBe("Kết quả thật.");
  });
});

describe("POST /attempts - AI lỗi: attempt vẫn còn với score NULL", () => {
  const cases: [string, Error & { code: string; statusCode: number }][] = [
    ["AI_INVALID_FORMAT", new AIInvalidFormatError(2) as never],
    ["AI_QUOTA_EXCEEDED", new AIQuotaExceededError() as never],
    ["TIMEOUT", new AIServiceError("TIMEOUT", 1) as never],
  ];

  it.each(cases)("%s -> trả đúng mã lỗi, bài đã lưu, score/ai_feedback NULL", async (_name, error) => {
    gradeWritingMock.mockRejectedValue(error);
    const before = await countAttempts();

    const res = await post({ exerciseId: ids.writingLib, answer: { text: "Essay kept safe." } }, users.studentA);
    expect(res.status).toBe(error.statusCode);
    expect(res.body.data).toBeNull();
    expect(res.body.error!.code).toBe(error.code);
    expect(res.rawText).not.toContain("Essay kept safe.");

    expect(await countAttempts()).toBe(before + 1);
    const row = await prisma.attempt.findFirst({
      where: { studentId: users.studentA },
      orderBy: { id: "desc" },
    });
    expect(row).toMatchObject({ score: null, aiFeedback: null, errors: [], maxScore: 10 });
    expect(row!.answer).toEqual({ text: "Essay kept safe." });
  });
});

describe("POST /attempts - writing bài giao", () => {
  it("lần 1-3 đều được chấm và giữ lịch sử; lần 4 -> 409, KHÔNG gọi AI; điểm cao nhất = max các lần", async () => {
    const asg = await newAssignment(24 * HOUR);
    const crit: [number, number, number, number][] = [[5, 5, 5, 5], [9, 9, 9, 9], [7, 7, 7, 7]];

    for (let n = 1; n <= MAX_ATTEMPTS_PER_ASSIGNMENT; n++) {
      gradeWritingMock.mockResolvedValueOnce(grade(crit[n - 1], [AI_ERROR]));
      const res = await post({ assignmentId: asg.id, answer: { text: `Essay ${n}` } }, users.studentA);
      expect(res.status).toBe(201);
      expect(res.body.data!.attemptNo).toBe(n);
      expect(res.body.data!.score).toBe(crit[n - 1][0]);
    }
    expect(gradeWritingMock).toHaveBeenCalledTimes(MAX_ATTEMPTS_PER_ASSIGNMENT);

    const fourth = await post({ assignmentId: asg.id, answer: { text: "Essay 4" } }, users.studentA);
    expect(fourth.status).toBe(409);
    expect(fourth.body.error!.code).toBe("ATTEMPT_LIMIT_REACHED");
    expect(gradeWritingMock).toHaveBeenCalledTimes(MAX_ATTEMPTS_PER_ASSIGNMENT); // không gọi thêm

    const rows = await prisma.attempt.findMany({
      where: { studentId: users.studentA, assignmentId: asg.id },
      orderBy: { id: "asc" },
    });
    expect(rows.map((r) => r.score)).toEqual([5, 9, 7]);

    const history = await get(`/api/v1/attempts?assignmentId=${asg.id}`, users.studentA);
    expect(history.status).toBe(200);
    expect(history.body.data!.attemptsCount).toBe(3);
    expect(history.body.data!.bestScore).toBe(9);
  });

  it("nộp sau due_at: is_late = true và vẫn được chấm", async () => {
    const asg = await newAssignment(-1 * HOUR);
    gradeWritingMock.mockResolvedValue(grade([8, 8, 8, 8]));
    const res = await post({ assignmentId: asg.id, answer: { text: "Late essay" } }, users.studentA);
    expect(res.status).toBe(201);
    expect(res.body.data!.score).toBe(8);
    const row = await prisma.attempt.findUnique({ where: { id: res.body.data!.attemptId } });
    expect(row).toMatchObject({ isLate: true, score: 8 });
  });
});

describe("Ghi kết quả có điều kiện (score IS NULL)", () => {
  it("hai lần chấm song song cùng một attempt: chỉ một lần ghi thắng, lần kia không ghi đè", async () => {
    const attempt = await prisma.attempt.create({
      data: {
        studentId: users.studentA,
        exerciseId: ids.writingLib,
        mode: "practice",
        answer: { text: "Parallel essay" },
        score: null,
        maxScore: 10,
        errors: [],
      },
      select: { id: true },
    });
    gradeWritingMock
      .mockResolvedValueOnce(grade([4, 4, 4, 4], [], "Lần A"))
      .mockResolvedValueOnce(grade([8, 8, 8, 8], [], "Lần B"));

    const target = {
      attemptId: attempt.id,
      userId: users.studentA,
      role: "STUDENT" as const,
      text: "Parallel essay",
      exercise: { level: "A2", content: { prompt: "p", minWords: 10 } },
    };
    const [r1, r2] = await Promise.all([gradeWritingAttempt(target), gradeWritingAttempt(target)]);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect([4, 8]).toContain(row.score);
    // Cả hai nơi gọi nhận đúng dữ liệu đang lưu trong DB (kẻ thua không trả điểm riêng của mình)
    expect(r1.score).toBe(row.score);
    expect(r2.score).toBe(row.score);
    expect((row.aiFeedback as Row).comment).toBe(row.score === 4 ? "Lần A" : "Lần B");
  });
});

describe("Dạng chấm tự động không phụ thuộc AI", () => {
  it("AI hết lượt nhưng fill_blank vẫn chấm bình thường, không gọi AI", async () => {
    gradeWritingMock.mockRejectedValue(new AIQuotaExceededError());
    const res = await post({ exerciseId: ids.fillBlank, answer: ["goes"] }, users.studentA);
    expect(res.status).toBe(201);
    expect(res.body.data!.score).toBe(10);
    expect(gradeWritingMock).not.toHaveBeenCalled();
  });
});

describe("Lộ kết quả writing theo 4c.4 (criteria + comment luôn có)", () => {
  const CRITERIA = { content: 6.5, coherence: 7, vocabulary: 7, grammar: 7 };
  const HIDDEN_ERROR = { type: "grammar:tense", text: "I goes" };

  // Không có key nào chứa ai_feedback thô; correction/explanation đã ẩn hay chưa tùy ca.
  const expectNoRawFeedback = (data: Row) => {
    expect("aiFeedback" in data).toBe(false);
    expect("ai_feedback" in data).toBe(false);
  };

  it("bài giao TRƯỚC due_at: POST và GET đều ẩn correction/explanation, vẫn có criteria + comment", async () => {
    const asg = await newAssignment(24 * HOUR);
    gradeWritingMock.mockResolvedValue(grade([6.5, 7, 7, 7], [AI_ERROR], "Nhận xét trước hạn."));

    const res = await post({ assignmentId: asg.id, answer: { text: "I goes to school." } }, users.studentA);
    expect(res.status).toBe(201);
    const posted = res.body.data!;
    expect(posted.errors).toEqual([HIDDEN_ERROR]); // chỉ type + text
    expect("explanation" in posted).toBe(false);
    expect("answer" in posted).toBe(false);
    expect(posted.criteria).toEqual(CRITERIA);
    expect(posted.comment).toBe("Nhận xét trước hạn.");
    expect(posted.score).toBe(6.88);
    expectNoRawFeedback(posted);

    const detail = await get(`/api/v1/attempts/${posted.attemptId}`, users.studentA);
    expect(detail.status).toBe(200);
    const d = detail.body.data!;
    expect(d.errors).toEqual([HIDDEN_ERROR]);
    expect("explanation" in d).toBe(false);
    expect(d.criteria).toEqual(CRITERIA);
    expect(d.comment).toBe("Nhận xét trước hạn.");
    expectNoRawFeedback(d);
  });

  it("cùng bài giao SAU due_at: GET lộ đủ correction/explanation, criteria + comment không đổi", async () => {
    const asg = await newAssignment(24 * HOUR);
    gradeWritingMock.mockResolvedValue(grade([6.5, 7, 7, 7], [AI_ERROR], "Nhận xét."));

    const res = await post({ assignmentId: asg.id, answer: { text: "I goes to school." } }, users.studentA);
    expect(res.status).toBe(201);
    const id = res.body.data!.attemptId;

    // Dời hạn chót về quá khứ (giả lập "đã qua due_at").
    await prisma.assignment.update({
      where: { id: asg.id },
      data: { dueAt: new Date(Date.now() - HOUR) },
    });

    const detail = await get(`/api/v1/attempts/${id}`, users.studentA);
    expect(detail.status).toBe(200);
    const d = detail.body.data!;
    expect(d.errors).toEqual([AI_ERROR]); // đủ correction + explanation
    expect(d.criteria).toEqual(CRITERIA);
    expect(d.comment).toBe("Nhận xét.");
    expect(d.score).toBe(6.88);
    expectNoRawFeedback(d);
  });

  it("tự luyện: POST và GET đều lộ đủ ngay, criteria + comment có", async () => {
    gradeWritingMock.mockResolvedValue(grade([6.5, 7, 7, 7], [AI_ERROR], "Nhận xét tự luyện."));

    const res = await post({ exerciseId: ids.writingLib, answer: { text: "I goes to school." } }, users.studentA);
    expect(res.status).toBe(201);
    const posted = res.body.data!;
    expect(posted.errors).toEqual([AI_ERROR]);
    expect(posted.criteria).toEqual(CRITERIA);
    expect(posted.comment).toBe("Nhận xét tự luyện.");
    expectNoRawFeedback(posted);

    const detail = await get(`/api/v1/attempts/${posted.attemptId}`, users.studentA);
    expect(detail.status).toBe(200);
    expect(detail.body.data!.errors).toEqual([AI_ERROR]);
    expect(detail.body.data!.criteria).toEqual(CRITERIA);
    expect(detail.body.data!.comment).toBe("Nhận xét tự luyện.");
    expectNoRawFeedback(detail.body.data!);
  });

  it("bài giao nộp TRỄ (đã quá due_at lúc nộp): POST lộ đủ ngay", async () => {
    const asg = await newAssignment(-1 * HOUR);
    gradeWritingMock.mockResolvedValue(grade([6.5, 7, 7, 7], [AI_ERROR], "Nhận xét nộp trễ."));

    const res = await post({ assignmentId: asg.id, answer: { text: "I goes to school." } }, users.studentA);
    expect(res.status).toBe(201);
    expect(res.body.data!.errors).toEqual([AI_ERROR]);
    expect(res.body.data!.criteria).toEqual(CRITERIA);
    expect(res.body.data!.comment).toBe("Nhận xét nộp trễ.");
    expectNoRawFeedback(res.body.data!);
  });
});

// ---------------------------------------------------------------------------
// 6. Điểm AI trong danh sách bài nộp của GV; COALESCE(teacher_score, score); log
// ---------------------------------------------------------------------------
describe("Điểm AI: GV thấy đúng điểm, teacher_score ghi đè, quyền xem", () => {
  const teacherItems = async (asgId: number) => {
    const res = await call("GET", `/api/v1/assignments/${asgId}/submissions`, users.teacher);
    expect(res.status).toBe(200);
    return res.body.data!.items as Row[];
  };

  it("GV lớp mình thấy điểm AI (chưa chấm tay): bestScore = điểm AI, bestAttemptId = lần vừa nộp", async () => {
    const asg = await newAssignment(24 * HOUR);
    const sub = await submitAsg(asg.id, "Essay của A", users.studentA);
    expect(sub.status).toBe(201);
    const attemptId = sub.body.data!.attemptId as number;

    const a = (await teacherItems(asg.id)).find((i) => i.studentId === users.studentA)!;
    expect(a).toMatchObject({
      status: "SUBMITTED",
      attemptsUsed: 1,
      bestScore: FAKE_SCORE,
      bestAttemptId: attemptId,
    });
  });

  it("COALESCE(teacher_score, score): điểm GV ghi đè điểm AI; teacher_score = 0 vẫn thắng (0 không phải NULL)", async () => {
    const asg = await newAssignment(24 * HOUR);
    const subA = await submitAsg(asg.id, "Essay của A", users.studentA);
    const subB = await submitAsg(asg.id, "Essay của B", users.studentB);
    const aId = subA.body.data!.attemptId as number;
    const bId = subB.body.data!.attemptId as number;

    // Cả hai đều đã có điểm AI (7.25); GV chấm tay A = 8, B = 0.
    await prisma.attempt.update({ where: { id: aId }, data: { teacherScore: 8 } });
    await prisma.attempt.update({ where: { id: bId }, data: { teacherScore: 0 } });

    const items = await teacherItems(asg.id);
    expect(items.find((i) => i.studentId === users.studentA)).toMatchObject({
      bestScore: 8,
      bestAttemptId: aId,
    });
    expect(items.find((i) => i.studentId === users.studentB)).toMatchObject({
      bestScore: 0,
      bestAttemptId: bId,
    });

    // Phía HS: score vẫn là điểm AI, finalScore = COALESCE(teacher_score, score).
    const detailA = await call("GET", `/api/v1/attempts/${aId}`, users.studentA);
    expect(detailA.body.data).toMatchObject({ score: FAKE_SCORE, teacherScore: 8, finalScore: 8 });
    const detailB = await call("GET", `/api/v1/attempts/${bId}`, users.studentB);
    expect(detailB.body.data).toMatchObject({ score: FAKE_SCORE, teacherScore: 0, finalScore: 0 });
  });

  it("GV lớp khác: 404 và response không chứa điểm AI", async () => {
    const asg = await newAssignment(24 * HOUR);
    await submitAsg(asg.id, "Essay của A", users.studentA);

    const other = await call("GET", `/api/v1/assignments/${asg.id}/submissions`, users.teacher2);
    expect(other.status).toBe(404);
    expect(other.rawText).not.toContain(String(FAKE_SCORE));
    expect(other.rawText).not.toContain("bestScore");
  });

  it("log không chứa kết quả AI (nhận xét, lỗi, đáp án sửa, giải thích) khi nộp writing", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );
    try {
      const asg = await newAssignment(24 * HOUR);
      const ok = await submitAsg(asg.id, "Essay để kiểm log", users.studentA);
      expect(ok.status).toBe(201);
      await call("GET", `/api/v1/attempts/${ok.body.data!.attemptId}`, users.studentA);

      const logged = spies
        .flatMap((spy) => spy.mock.calls)
        .map((args) => inspect(args, { depth: 6 }));
      const aiTexts = [
        FAKE_GRADE.comment,
        ...FAKE_GRADE.errors.flatMap((e) => [e.text, e.correction, e.explanation]),
      ];
      for (const line of logged) {
        for (const text of aiTexts) expect(line).not.toContain(text);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});