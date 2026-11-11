/**
 * Test tích hợp GET /api/v1/attempts/:id (chi tiết một lần nộp của chính HS).
 * Gọi API thật (HTTP) + DB PostgreSQL thật; dữ liệu tạo thẳng bằng Prisma.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo user/lớp/bài/assignment/attempts riêng, xóa sạch sau khi chạy.
 * - Tiền tố "t4dt_" riêng để không xóa nhầm dữ liệu của test khác.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t4dt_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// Chuỗi "đặc biệt" để dò rò rỉ trước hạn.
const SECRET_A = "zebraquux";
const SECRET_B = "yakquuxtwo";
const SECRET_EXPLANATION = "EXPL_secret_zebra";
const SECRET_CORRECTION = "CORR_secret_zebra";
const SECRET_ERR_EXPLANATION = "ERREXPL_secret_zebra";
const STUDENT_ANSWER = ["wrongword", "wrongword2"];
const TEACHER_COMMENT = "Em làm tốt, chú ý thì hiện tại";

const users = { admin: 0, teacher: 0, studentA: 0, studentB: 0 };
const ids = {
  classA: 0,
  exAsg: 0, // bài của các bài giao
  exP: 0, // bài tự luyện
  asgFuture: 0, // hạn còn 24h
  asgPast: 0, // hạn đã qua 24h
  asgFlip: 0, // dùng để đổi hạn giữa chừng
};
const A: Record<string, number> = {};
const B: Record<string, number> = {};

let server: Server;
let baseUrl = "";

const HOUR = 60 * 60 * 1000;
const BASE = Date.now() - 48 * HOUR;
const at = (minutes: number) => new Date(BASE + minutes * 60 * 1000);

const createUser = async (
  label: string,
  role: "ADMIN" | "TEACHER" | "STUDENT"
) => {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`,
      // email phải viết thường (DB có CHECK) nên nhãn không dùng chữ hoa
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
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const newFillBlank = async (
  label: string,
  status: "DRAFT" | "PUBLISHED",
  inLibrary: boolean
) => {
  const row = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} ${label}`,
      content: { text: "___ and ___" },
      answer: [SECRET_A, SECRET_B],
      explanation: SECRET_EXPLANATION,
      status,
      source: "TEACHER",
      inLibrary,
      createdById: users.teacher,
    },
    select: { id: true },
  });
  return row.id;
};

const newAssignment = async (exerciseId: number, dueOffsetMs: number) => {
  const row = await prisma.assignment.create({
    data: {
      exerciseId,
      classId: ids.classA,
      assignedById: users.teacher,
      dueAt: new Date(Date.now() + dueOffsetMs),
    },
    select: { id: true },
  });
  return row.id;
};

interface NewAttempt {
  studentId: number;
  exerciseId: number;
  assignmentId: number | null;
  score: number | null;
  teacherScore?: number | null;
  teacherComment?: string | null;
  isLate?: boolean;
  minute: number;
}

const newAttempt = async (input: NewAttempt) => {
  const row = await prisma.attempt.create({
    data: {
      studentId: input.studentId,
      exerciseId: input.exerciseId,
      assignmentId: input.assignmentId,
      mode: "practice",
      answer: STUDENT_ANSWER,
      score: input.score,
      maxScore: 10,
      errors: [
        {
          type: "vocab",
          text: "wrongword",
          correction: SECRET_CORRECTION,
          explanation: SECRET_ERR_EXPLANATION,
        },
      ],
      teacherScore: input.teacherScore ?? null,
      teacherComment: input.teacherComment ?? null,
      isLate: input.isLate ?? false,
      submittedAt: at(input.minute),
    },
    select: { id: true },
  });
  return row.id;
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  // attempts -> lớp (cascade xóa assignments + class_members) -> bài -> user
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
  await cleanup(leftovers.map((u) => u.id));

  users.admin = await createUser("admin", "ADMIN");
  users.teacher = await createUser("teacher", "TEACHER");
  users.studentA = await createUser("student_a", "STUDENT");
  users.studentB = await createUser("student_b", "STUDENT");

  const cls = await prisma.class.create({
    data: {
      name: `${RUN_ID} class_a`,
      code: randomClassCode(),
      teacherId: users.teacher,
    },
    select: { id: true },
  });
  ids.classA = cls.id;
  for (const studentId of [users.studentA, users.studentB]) {
    await prisma.classMember.create({
      data: { classId: ids.classA, studentId },
    });
  }

  ids.exAsg = await newFillBlank("exAsg", "DRAFT", false);
  ids.exP = await newFillBlank("exP", "PUBLISHED", true);
  ids.asgFuture = await newAssignment(ids.exAsg, 24 * HOUR);
  ids.asgPast = await newAssignment(ids.exAsg, -24 * HOUR);
  ids.asgFlip = await newAssignment(ids.exAsg, 24 * HOUR);

  const a = users.studentA;
  const b = users.studentB;

  // Tự luyện: 2 lần; lần 2 GV chấm 0 (điểm 0 phải thắng điểm máy 3).
  A.p1 = await newAttempt({ studentId: a, exerciseId: ids.exP, assignmentId: null, score: 5, minute: 10 });
  A.p2 = await newAttempt({ studentId: a, exerciseId: ids.exP, assignmentId: null, score: 3, teacherScore: 0, minute: 20 });

  // Bài giao CHƯA tới hạn: lần 2 có GV nâng điểm 2 -> 9 + nhận xét.
  A.f1 = await newAttempt({ studentId: a, exerciseId: ids.exAsg, assignmentId: ids.asgFuture, score: 5, minute: 30 });
  B.f1 = await newAttempt({ studentId: b, exerciseId: ids.exAsg, assignmentId: ids.asgFuture, score: 10, minute: 35 }); // xen giữa, không được làm lệch attemptNo của A
  A.f2 = await newAttempt({ studentId: a, exerciseId: ids.exAsg, assignmentId: ids.asgFuture, score: 2, teacherScore: 9, teacherComment: TEACHER_COMMENT, minute: 40 });

  // Bài giao ĐÃ quá hạn (nộp trễ).
  A.past = await newAttempt({ studentId: a, exerciseId: ids.exAsg, assignmentId: ids.asgPast, score: 5, isLate: true, minute: 50 });

  // Bài giao dùng để đổi hạn.
  A.flip = await newAttempt({ studentId: a, exerciseId: ids.exAsg, assignmentId: ids.asgFlip, score: 5, minute: 60 });

  // Tự luyện của HS B.
  B.p1 = await newAttempt({ studentId: b, exerciseId: ids.exP, assignmentId: null, score: 10, minute: 70 });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Không mở được server test");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await cleanup(Object.values(users).filter((id) => id > 0));
  await prisma.$disconnect();
});

const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

type Detail = Record<string, unknown> & {
  errors: Array<Record<string, unknown>>;
};

interface ApiResult {
  status: number;
  raw: string;
  body: {
    data: Detail | null;
    error: { code: string; message: string } | null;
  };
}

const getDetail = async (id: string | number, userId?: number): Promise<ApiResult> => {
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;
  const res = await fetch(`${baseUrl}/api/v1/attempts/${id}`, { headers });
  const raw = await res.text();
  return { status: res.status, raw, body: JSON.parse(raw) };
};

const detailOf = (r: ApiResult): Detail => {
  expect(r.status, r.raw).toBe(200);
  expect(r.body.error).toBeNull();
  return r.body.data as Detail;
};

const REVEALED_KEYS = [
  "answer",
  "assignmentId",
  "attemptId",
  "attemptNo",
  "correct",
  "errors",
  "exerciseId",
  "explanation",
  "finalScore",
  "isLate",
  "maxScore",
  "mode",
  "score",
  "submittedAnswer",
  "submittedAt",
  "teacherComment",
  "teacherScore",
  "total",
];
const HIDDEN_KEYS = REVEALED_KEYS.filter(
  (k) => k !== "answer" && k !== "explanation"
);

const ALL_SECRETS = [
  SECRET_A,
  SECRET_B,
  SECRET_EXPLANATION,
  SECRET_CORRECTION,
  SECRET_ERR_EXPLANATION,
];

describe("Tự luyện: lộ ngay", () => {
  it("200: có đáp án đúng, explanation, correction; bài làm của HS ở submittedAnswer", async () => {
    const d = detailOf(await getDetail(A.p1, users.studentA));
    expect(Object.keys(d).sort()).toEqual(REVEALED_KEYS);
    expect(d.attemptId).toBe(A.p1);
    expect(d.exerciseId).toBe(ids.exP);
    expect(d.assignmentId).toBeNull();
    expect(d.mode).toBe("practice");
    expect(d.answer).toEqual([SECRET_A, SECRET_B]);
    expect(d.explanation).toBe(SECRET_EXPLANATION);
    expect(d.submittedAnswer).toEqual(STUDENT_ANSWER);
    expect(d.errors).toEqual([
      {
        type: "vocab",
        text: "wrongword",
        correction: SECRET_CORRECTION,
        explanation: SECRET_ERR_EXPLANATION,
      },
    ]);
    expect(d.score).toBe(5);
    expect(d.maxScore).toBe(10);
    expect(d.correct).toBe(1);
    expect(d.total).toBe(2);
    expect(d.isLate).toBe(false);
    expect(d.teacherScore).toBeNull();
    expect(d.finalScore).toBe(5);
    expect(d.teacherComment).toBeNull();
    expect(d.submittedAt).toBe(at(10).toISOString());
  });

  it("teacher_score = 0 ghi đè điểm máy 3: finalScore = 0", async () => {
    const d = detailOf(await getDetail(A.p2, users.studentA));
    expect(d.score).toBe(3);
    expect(d.teacherScore).toBe(0);
    expect(d.finalScore).toBe(0);
  });
});

describe("Bài giao TRƯỚC hạn: không lộ", () => {
  it("không có key answer / explanation, errors chỉ còn {type, text}, không chuỗi bí mật nào", async () => {
    const r = await getDetail(A.f1, users.studentA);
    const d = detailOf(r);
    expect(Object.keys(d).sort()).toEqual(HIDDEN_KEYS);
    expect(d).not.toHaveProperty("answer");
    expect(d).not.toHaveProperty("explanation");
    expect(d.errors).toEqual([{ type: "vocab", text: "wrongword" }]);
    for (const secret of ALL_SECRETS) expect(r.raw).not.toContain(secret);
    expect(r.raw).not.toMatch(/"answer"\s*:/);
    expect(r.raw).not.toMatch(/"explanation"\s*:/);
    expect(r.raw).not.toMatch(/"correction"\s*:/);
  });

  it("vẫn trả những gì HS được xem: bài làm của mình, score, correct, total, isLate", async () => {
    const d = detailOf(await getDetail(A.f1, users.studentA));
    expect(d.submittedAnswer).toEqual(STUDENT_ANSWER);
    expect(d.score).toBe(5);
    expect(d.correct).toBe(1);
    expect(d.total).toBe(2);
    expect(d.assignmentId).toBe(ids.asgFuture);
    expect(d.isLate).toBe(false);
  });

  it("điểm GV nâng 2 -> 9 và nhận xét GV vẫn hiện (không phải đáp án)", async () => {
    const d = detailOf(await getDetail(A.f2, users.studentA));
    expect(d.score).toBe(2);
    expect(d.teacherScore).toBe(9);
    expect(d.finalScore).toBe(9);
    expect(d.teacherComment).toBe(TEACHER_COMMENT);
    expect(d).not.toHaveProperty("answer");
  });
});

describe("Bài giao SAU hạn: lộ đủ", () => {
  it("có answer, explanation, correction; isLate true", async () => {
    const d = detailOf(await getDetail(A.past, users.studentA));
    expect(Object.keys(d).sort()).toEqual(REVEALED_KEYS);
    expect(d.answer).toEqual([SECRET_A, SECRET_B]);
    expect(d.explanation).toBe(SECRET_EXPLANATION);
    expect(d.errors[0]).toMatchObject({
      correction: SECRET_CORRECTION,
      explanation: SECRET_ERR_EXPLANATION,
    });
    expect(d.submittedAnswer).toEqual(STUDENT_ANSWER);
    expect(d.isLate).toBe(true);
    expect(d.assignmentId).toBe(ids.asgPast);
  });

  it("cùng một bài nộp: hạn còn -> không lộ; đổi hạn sang quá khứ -> lộ ngay; đổi lại -> lại ẩn", async () => {
    const hidden = await getDetail(A.flip, users.studentA);
    expect(detailOf(hidden)).not.toHaveProperty("answer");

    await prisma.assignment.update({
      where: { id: ids.asgFlip },
      data: { dueAt: new Date(Date.now() - 1000) },
    });
    const revealed = detailOf(await getDetail(A.flip, users.studentA));
    expect(revealed.answer).toEqual([SECRET_A, SECRET_B]);
    expect(revealed.explanation).toBe(SECRET_EXPLANATION);

    await prisma.assignment.update({
      where: { id: ids.asgFlip },
      data: { dueAt: new Date(Date.now() + HOUR) },
    });
    const hiddenAgain = await getDetail(A.flip, users.studentA);
    expect(detailOf(hiddenAgain)).not.toHaveProperty("answer");
    for (const secret of ALL_SECRETS) expect(hiddenAgain.raw).not.toContain(secret);
  });
});

describe("attemptNo", () => {
  it("bài giao: lần 1 và lần 2 của A, không bị lần nộp xen giữa của HS B làm lệch", async () => {
    expect(detailOf(await getDetail(A.f1, users.studentA)).attemptNo).toBe(1);
    expect(detailOf(await getDetail(A.f2, users.studentA)).attemptNo).toBe(2);
    expect(detailOf(await getDetail(B.f1, users.studentB)).attemptNo).toBe(1);
  });

  it("mỗi bài giao / bài tự luyện đánh số riêng", async () => {
    expect(detailOf(await getDetail(A.p1, users.studentA)).attemptNo).toBe(1);
    expect(detailOf(await getDetail(A.p2, users.studentA)).attemptNo).toBe(2);
    expect(detailOf(await getDetail(A.past, users.studentA)).attemptNo).toBe(1);
    expect(detailOf(await getDetail(A.flip, users.studentA)).attemptNo).toBe(1);
  });

  it("khớp với attemptNo trong danh sách", async () => {
    const res = await fetch(`${baseUrl}/api/v1/attempts?limit=50`, {
      headers: { Authorization: `Bearer ${tokenOf(users.studentA)}` },
    });
    const list = (await res.json()).data.items as Array<{ id: number; attemptNo: number }>;
    for (const item of list) {
      const d = detailOf(await getDetail(item.id, users.studentA));
      expect(d.attemptNo, `id=${item.id}`).toBe(item.attemptNo);
    }
  });
});

describe("Chỉ xem được bài nộp của chính mình (404)", () => {
  it("HS B xem bài nộp của HS A -> 404; HS A xem của B -> 404", async () => {
    const r1 = await getDetail(A.p1, users.studentB);
    expect(r1.status).toBe(404);
    expect(r1.body.data).toBeNull();
    expect(r1.body.error?.code).toBe("NOT_FOUND");
    for (const secret of ALL_SECRETS) expect(r1.raw).not.toContain(secret);

    const r2 = await getDetail(B.p1, users.studentA);
    expect(r2.status).toBe(404);
    // kể cả bài giao đã quá hạn của A: B vẫn không xem được
    const r3 = await getDetail(A.past, users.studentB);
    expect(r3.status).toBe(404);
  });

  it("id không tồn tại -> 404, CÙNG thông báo với id của người khác (không dò được)", async () => {
    const missing = await getDetail(2147483647, users.studentA);
    const other = await getDetail(B.p1, users.studentA);
    expect(missing.status).toBe(404);
    expect(missing.body.error?.code).toBe("NOT_FOUND");
    expect(missing.body.error?.message).toBe(other.body.error?.message);
  });
});

describe("Response gọn, không field thừa hoặc bí mật", () => {
  it("không có studentId, aiFeedback, nội dung bài (content), passwordHash...", async () => {
    for (const id of [A.p1, A.f1, A.past]) {
      const r = await getDetail(id, users.studentA);
      expect(r.status).toBe(200);
      for (const key of ["studentId", "aiFeedback", "content", "passwordHash", "email", "createdById"]) {
        expect(r.raw, `${key} (id=${id})`).not.toContain(`"${key}"`);
      }
    }
  });
});

describe("Quyền", () => {
  it("401: không có token", async () => {
    const r = await getDetail(A.p1);
    expect(r.status).toBe(401);
    expect(r.body.data).toBeNull();
    expect(r.body.error?.code).toBe("UNAUTHORIZED");
  });

  it("401: token sai", async () => {
    const res = await fetch(`${baseUrl}/api/v1/attempts/${A.p1}`, {
      headers: { Authorization: "Bearer not.a.token" },
    });
    expect(res.status).toBe(401);
  });

  it("403: TEACHER và ADMIN (kể cả với id có thật)", async () => {
    for (const userId of [users.teacher, users.admin]) {
      const r = await getDetail(A.p1, userId);
      expect(r.status).toBe(403);
      expect(r.body.error?.code).toBe("FORBIDDEN");
      expect(r.body.data).toBeNull();
      for (const secret of ALL_SECRETS) expect(r.raw).not.toContain(secret);
    }
  });

  it("403 đứng trước 400: GV gọi với id sai kiểu vẫn nhận 403", async () => {
    const r = await getDetail("abc", users.teacher);
    expect(r.status).toBe(403);
  });
});

describe("400: id sai", () => {
  for (const bad of ["abc", "0", "-1", "1.5", "99999999999", "1e3"]) {
    it(`id = ${bad}`, async () => {
      const r = await getDetail(bad, users.studentA);
      expect(r.status).toBe(400);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    });
  }
});

describe("Không hồi quy: GET /attempts (danh sách) vẫn chạy cạnh /:id", () => {
  it("200 và không chứa đáp án", async () => {
    const res = await fetch(`${baseUrl}/api/v1/attempts?assignmentId=${ids.asgPast}`, {
      headers: { Authorization: `Bearer ${tokenOf(users.studentA)}` },
    });
    const raw = await res.text();
    expect(res.status).toBe(200);
    for (const secret of ALL_SECRETS) expect(raw).not.toContain(secret);
    expect(JSON.parse(raw).data.total).toBe(1);
  });
});