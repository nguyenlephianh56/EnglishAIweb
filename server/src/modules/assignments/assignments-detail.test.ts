/**
 * Test tích hợp GET /api/v1/assignments/:id (chi tiết bài giao cho HS).
 * Gọi API thật (HTTP) + DB PostgreSQL thật; assignment/attempt tạo thẳng bằng Prisma.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo dữ liệu riêng, xóa sạch sau khi chạy. Tiền tố "t5det_" riêng.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t5det_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;

const SECRET_ANSWER = "zebraquux";
const SECRET_EXPLANATION = "EXPL_secret_zebra";
const MC_OPTION = "option_visible_text";

const users = { admin: 0, teacher: 0, teacher2: 0, s1: 0, s2: 0, outsider: 0 };
const ids = {
  classA: 0,
  classB: 0,
  exFill: 0,
  exMc: 0,
  exHidden: 0,
  before: 0, // lớp A, fill_blank, hạn +24h; s1 nộp 1 lần score 5
  past: 0, // lớp A, fill_blank, hạn -24h; s1 nộp 3 lần trễ (2, 8, 6)
  mc: 0, // lớp A, multiple_choice, hạn +24h
  otherClass: 0, // lớp B
  hidden: 0, // lớp A, exercise HIDDEN
  flip: 0, // lớp A, dùng để đổi hạn từ tương lai sang quá khứ
};

let server: Server;
let baseUrl = "";

const createUser = async (
  label: string,
  role: "ADMIN" | "TEACHER" | "STUDENT"
) => {
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
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const createClass = async (teacherId: number, name: string) => {
  const row = await prisma.class.create({
    data: { name: `${RUN_ID} ${name}`, code: randomClassCode(), teacherId },
    select: { id: true },
  });
  return row.id;
};

const newFillBlank = async (status: "PUBLISHED" | "HIDDEN", label: string) => {
  const row = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} ${label}`,
      content: { text: "She ___ to school." },
      answer: [SECRET_ANSWER],
      explanation: SECRET_EXPLANATION,
      status,
      source: "TEACHER",
      inLibrary: false,
      createdById: users.teacher,
    },
    select: { id: true },
  });
  return row.id;
};

const newMultipleChoice = async () => {
  const row = await prisma.exercise.create({
    data: {
      type: "multiple_choice",
      skill: "READING",
      level: "A2",
      topic: `${RUN_ID} mc`,
      content: { questions: [{ q: "Pick one", options: ["alpha", MC_OPTION] }] },
      answer: [1],
      explanation: SECRET_EXPLANATION,
      status: "PUBLISHED",
      source: "TEACHER",
      inLibrary: false,
      createdById: users.teacher,
    },
    select: { id: true },
  });
  return row.id;
};

const newAssignment = async (
  classId: number,
  exerciseId: number,
  assignedById: number,
  dueOffsetHours: number
) => {
  const row = await prisma.assignment.create({
    data: {
      classId,
      exerciseId,
      assignedById,
      dueAt: new Date(Date.now() + dueOffsetHours * HOUR),
    },
    select: { id: true },
  });
  return row.id;
};

const newAttempt = async (input: {
  studentId: number;
  exerciseId: number;
  assignmentId: number;
  score: number;
  isLate?: boolean;
  minutesAgo: number;
}) => {
  await prisma.attempt.create({
    data: {
      studentId: input.studentId,
      exerciseId: input.exerciseId,
      assignmentId: input.assignmentId,
      mode: "practice",
      answer: ["x"],
      score: input.score,
      maxScore: 10,
      isLate: input.isLate ?? false,
      submittedAt: new Date(Date.now() - input.minutesAgo * 60 * 1000),
    },
  });
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
  await cleanup(leftovers.map((u) => u.id));

  users.admin = await createUser("admin", "ADMIN");
  users.teacher = await createUser("teacher", "TEACHER");
  users.teacher2 = await createUser("teacher2", "TEACHER");
  users.s1 = await createUser("s1", "STUDENT");
  users.s2 = await createUser("s2", "STUDENT");
  users.outsider = await createUser("outsider", "STUDENT");

  ids.classA = await createClass(users.teacher, "class_a");
  ids.classB = await createClass(users.teacher2, "class_b");
  await prisma.classMember.create({ data: { classId: ids.classA, studentId: users.s1 } });
  await prisma.classMember.create({ data: { classId: ids.classA, studentId: users.s2 } });
  await prisma.classMember.create({ data: { classId: ids.classB, studentId: users.outsider } });

  ids.exFill = await newFillBlank("PUBLISHED", "fill");
  ids.exHidden = await newFillBlank("HIDDEN", "fill_hidden");
  ids.exMc = await newMultipleChoice();

  ids.before = await newAssignment(ids.classA, ids.exFill, users.teacher, 24);
  ids.past = await newAssignment(ids.classA, ids.exFill, users.teacher, -24);
  ids.mc = await newAssignment(ids.classA, ids.exMc, users.teacher, 24);
  ids.otherClass = await newAssignment(ids.classB, ids.exFill, users.teacher2, 24);
  ids.hidden = await newAssignment(ids.classA, ids.exHidden, users.teacher, 24);
  ids.flip = await newAssignment(ids.classA, ids.exFill, users.teacher, 24);

  await newAttempt({ studentId: users.s1, exerciseId: ids.exFill, assignmentId: ids.before, score: 5, minutesAgo: 30 });
  await newAttempt({ studentId: users.s1, exerciseId: ids.exFill, assignmentId: ids.past, score: 2, isLate: true, minutesAgo: 90 });
  await newAttempt({ studentId: users.s1, exerciseId: ids.exFill, assignmentId: ids.past, score: 8, isLate: true, minutesAgo: 60 });
  await newAttempt({ studentId: users.s1, exerciseId: ids.exFill, assignmentId: ids.past, score: 6, isLate: true, minutesAgo: 30 });

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

interface DetailBody {
  data: Record<string, any> | null;
  error: { code: string; message: string } | null;
}

const getDetail = async (idPart: string | number, userId?: number) => {
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;
  const res = await fetch(`${baseUrl}/api/v1/assignments/${idPart}`, { headers });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as DetailBody };
};

describe("GET /api/v1/assignments/:id - trước hạn", () => {
  it("s1: có đề (content), KHÔNG có answer, KHÔNG có explanation, không rò chuỗi bí mật", async () => {
    const res = await getDetail(ids.before, users.s1);
    expect(res.status).toBe(200);
    const exercise = res.body.data!.exercise;
    expect(exercise.id).toBe(ids.exFill);
    expect(exercise.type).toBe("fill_blank");
    expect(exercise.content).toEqual({ text: "She ___ to school." });
    expect("answer" in exercise).toBe(false);
    expect("explanation" in exercise).toBe(false);
    expect(res.text).not.toContain(SECRET_ANSWER);
    expect(res.text).not.toContain(SECRET_EXPLANATION);
    expect(res.text).not.toContain('"answer"');
  });

  it("s1: attemptsUsed, bestScore, status, maxAttempts đúng", async () => {
    const res = await getDetail(ids.before, users.s1);
    expect(res.body.data).toMatchObject({
      assignmentId: ids.before,
      status: "SUBMITTED",
      attemptsUsed: 1,
      maxAttempts: 3,
      bestScore: 5,
      lateSubmission: false,
    });
  });

  it("s2 (chưa làm): NOT_STARTED, 0 lần, bestScore null; attempt của s1 không tính cho s2", async () => {
    const res = await getDetail(ids.before, users.s2);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: "NOT_STARTED",
      attemptsUsed: 0,
      bestScore: null,
      lateSubmission: false,
    });
  });

  it("đúng field, không thừa: ngoài, exercise, class", async () => {
    const res = await getDetail(ids.before, users.s1);
    const data = res.body.data!;
    expect(Object.keys(data).sort()).toEqual(
      [
        "assignmentId",
        "attemptsUsed",
        "bestScore",
        "class",
        "dueAt",
        "exercise",
        "lateSubmission",
        "maxAttempts",
        "status",
      ].sort()
    );
    expect(Object.keys(data.exercise).sort()).toEqual(
      ["content", "id", "level", "skill", "topic", "type"].sort()
    );
    expect(Object.keys(data.class).sort()).toEqual(["id", "name"]);
    expect(res.text).not.toContain('"code"');
    expect(res.text).not.toContain("passwordHash");
  });

  it("dạng multiple_choice: có options trong content, không có answer", async () => {
    const res = await getDetail(ids.mc, users.s1);
    expect(res.status).toBe(200);
    const exercise = res.body.data!.exercise;
    expect(exercise.content.questions[0].options).toContain(MC_OPTION);
    expect("answer" in exercise).toBe(false);
    expect("explanation" in exercise).toBe(false);
    expect(res.text).not.toContain(SECRET_EXPLANATION);
  });
});

describe("GET /api/v1/assignments/:id - sau hạn", () => {
  it("s1: có explanation, vẫn KHÔNG có answer; attemptsUsed 3, bestScore 8, lateSubmission", async () => {
    const res = await getDetail(ids.past, users.s1);
    expect(res.status).toBe(200);
    const data = res.body.data!;
    expect(data.exercise.explanation).toBe(SECRET_EXPLANATION);
    expect("answer" in data.exercise).toBe(false);
    expect(res.text).not.toContain(SECRET_ANSWER);
    expect(data).toMatchObject({
      status: "SUBMITTED",
      attemptsUsed: 3,
      bestScore: 8,
      lateSubmission: true,
    });
  });

  it("s2 (không nộp): OVERDUE, vẫn xem được explanation, không có answer", async () => {
    const res = await getDetail(ids.past, users.s2);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: "OVERDUE",
      attemptsUsed: 0,
      bestScore: null,
    });
    expect(res.body.data!.exercise.explanation).toBe(SECRET_EXPLANATION);
    expect(res.text).not.toContain(SECRET_ANSWER);
  });

  it("cùng một bài giao: trước hạn không có explanation, đổi hạn sang quá khứ thì có", async () => {
    const before = await getDetail(ids.flip, users.s2);
    expect("explanation" in before.body.data!.exercise).toBe(false);
    expect(before.body.data!.status).toBe("NOT_STARTED");

    await prisma.assignment.update({
      where: { id: ids.flip },
      data: { dueAt: new Date(Date.now() - 60 * 1000) },
    });

    const after = await getDetail(ids.flip, users.s2);
    expect(after.body.data!.exercise.explanation).toBe(SECRET_EXPLANATION);
    expect(after.body.data!.status).toBe("OVERDUE");
    expect("answer" in after.body.data!.exercise).toBe(false);
  });
});

describe("GET /api/v1/assignments/:id - không có quyền xem -> 404", () => {
  it("HS ngoài lớp -> 404", async () => {
    const res = await getDetail(ids.before, users.outsider);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
    expect(res.text).not.toContain(SECRET_ANSWER);
    expect(res.text).not.toContain(SECRET_EXPLANATION);
  });

  it("bài giao của lớp khác -> 404", async () => {
    const res = await getDetail(ids.otherClass, users.s1);
    expect(res.status).toBe(404);
  });

  it("bài giao không tồn tại -> 404, cùng thông báo với 'không thuộc lớp' (không lộ id có tồn tại)", async () => {
    const missing = await getDetail(2147483000, users.s1);
    const foreign = await getDetail(ids.otherClass, users.s1);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toEqual(foreign.body.error);
  });

  it("exercise của bài giao đã HIDDEN -> 404", async () => {
    const res = await getDetail(ids.hidden, users.s1);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/assignments/:id - id sai -> 400", () => {
  it.each([["abc"], ["0"], ["-1"], ["1.5"], ["1e3"], ["99999999999"]])(
    "id %j -> 400",
    async (id) => {
      const res = await getDetail(id, users.s1);
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    }
  );
});

describe("GET /api/v1/assignments/:id - phân quyền", () => {
  it("không token -> 401", async () => {
    const res = await getDetail(ids.before);
    expect(res.status).toBe(401);
  });

  it("TEACHER (kể cả GV chủ lớp) -> 403", async () => {
    const res = await getDetail(ids.before, users.teacher);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("ADMIN -> 403", async () => {
    const res = await getDetail(ids.before, users.admin);
    expect(res.status).toBe(403);
  });

  it("GV gửi id sai vẫn nhận 403 (kiểm quyền trước kiểm id)", async () => {
    const res = await getDetail("abc", users.teacher);
    expect(res.status).toBe(403);
  });
});