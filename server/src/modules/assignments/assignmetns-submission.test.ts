/**
 * Test tích hợp GET /api/v1/assignments/:id/submissions (bài nộp của lớp, cho GV chủ lớp).
 * Gọi API thật (HTTP) + DB PostgreSQL thật; assignment/attempt tạo thẳng bằng Prisma.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo dữ liệu riêng, xóa sạch sau khi chạy. Tiền tố "t5sub_" riêng.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t5sub_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const SECRET_ANSWER = "zebraquux";
const SECRET_EXPLANATION = "EXPL_secret_zebra";
const PASSWORD_HASH = "not-a-real-hash"; // phải KHÔNG xuất hiện trong response

const users = {
  admin: 0,
  teacher: 0,
  teacher2: 0,
  s1: 0,
  s2: 0,
  s3: 0,
  s4: 0,
  ghost: 0, // có attempt ở bài giao của lớp A nhưng KHÔNG phải thành viên lớp A
  c1: 0, // thành viên lớp C
  c2: 0, // chưa là thành viên; sẽ vào lớp C giữa chừng
  outsider: 0, // chỉ thuộc lớp B
};
const ids = {
  classA: 0,
  classB: 0,
  classC: 0,
  ex: 0,
  past: 0, // lớp A, hạn -24h
  future: 0, // lớp A, hạn +24h (kiểm hòa điểm, điểm null)
  other: 0, // lớp B (teacher2)
  join: 0, // lớp C
  // id các lần nộp để so với bestAttemptId
  pastS1Best: 0,
  pastS2Best: 0,
  pastS3Only: 0,
  futureS1Tie1: 0,
  futureS2Null: 0,
};
const times = { pastS1Last: new Date(0), pastS2Last: new Date(0) };

let server: Server;
let baseUrl = "";

const createUser = async (
  label: string,
  role: "ADMIN" | "TEACHER" | "STUDENT"
) => {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`, // tên có thứ tự chữ cái theo label để kiểm sắp xếp
      email: `${RUN_ID}_${label}@test.local`,
      passwordHash: PASSWORD_HASH,
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

const newAssignment = async (
  classId: number,
  assignedById: number,
  dueOffsetHours: number
) => {
  const row = await prisma.assignment.create({
    data: {
      classId,
      exerciseId: ids.ex,
      assignedById,
      dueAt: new Date(Date.now() + dueOffsetHours * HOUR),
    },
    select: { id: true },
  });
  return row.id;
};

const newAttempt = async (input: {
  studentId: number;
  assignmentId: number;
  score: number | null;
  teacherScore?: number;
  isLate?: boolean;
  minutesAgo: number;
}) => {
  const submittedAt = new Date(Date.now() - input.minutesAgo * MINUTE);
  const row = await prisma.attempt.create({
    data: {
      studentId: input.studentId,
      exerciseId: ids.ex,
      assignmentId: input.assignmentId,
      mode: "practice",
      answer: ["x"],
      score: input.score,
      teacherScore: input.teacherScore,
      maxScore: 10,
      isLate: input.isLate ?? false,
      submittedAt,
    },
    select: { id: true },
  });
  return { id: row.id, submittedAt };
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
  for (const label of ["s1", "s2", "s3", "s4", "ghost", "c1", "c2", "outsider"] as const) {
    users[label] = await createUser(label, "STUDENT");
  }

  ids.classA = await createClass(users.teacher, "class_a");
  ids.classB = await createClass(users.teacher2, "class_b");
  ids.classC = await createClass(users.teacher, "class_c");
  const member = (classId: number, studentId: number) =>
    prisma.classMember.create({ data: { classId, studentId } });
  // Thêm theo thứ tự đảo để chắc chắn danh sách sắp theo tên chứ không theo thứ tự vào lớp.
  await member(ids.classA, users.s4);
  await member(ids.classA, users.s3);
  await member(ids.classA, users.s2);
  await member(ids.classA, users.s1);
  await member(ids.classB, users.outsider);
  await member(ids.classC, users.c1);

  const exercise = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} ex`,
      content: { text: "She ___ to school." },
      answer: [SECRET_ANSWER],
      explanation: SECRET_EXPLANATION,
      status: "PUBLISHED",
      source: "TEACHER",
      inLibrary: false,
      createdById: users.teacher,
    },
    select: { id: true },
  });
  ids.ex = exercise.id;

  ids.past = await newAssignment(ids.classA, users.teacher, -24);
  ids.future = await newAssignment(ids.classA, users.teacher, 24);
  ids.other = await newAssignment(ids.classB, users.teacher2, 24);
  ids.join = await newAssignment(ids.classC, users.teacher, 24);

  // --- bài giao quá hạn (past) ---
  // s1: 3 lần đều trễ (3, 7, 5) -> điểm cao nhất 7 ở lần thứ 2.
  await newAttempt({ studentId: users.s1, assignmentId: ids.past, score: 3, isLate: true, minutesAgo: 90 });
  const s1Best = await newAttempt({ studentId: users.s1, assignmentId: ids.past, score: 7, isLate: true, minutesAgo: 60 });
  const s1Last = await newAttempt({ studentId: users.s1, assignmentId: ids.past, score: 5, isLate: true, minutesAgo: 30 });
  ids.pastS1Best = s1Best.id;
  times.pastS1Last = s1Last.submittedAt;
  // s2: lần 1 score 4 nhưng GV chấm lại 9 (điểm cuối 9), lần 2 score 6 -> cao nhất 9 ở lần 1.
  const s2Best = await newAttempt({ studentId: users.s2, assignmentId: ids.past, score: 4, teacherScore: 9, minutesAgo: 60 });
  const s2Last = await newAttempt({ studentId: users.s2, assignmentId: ids.past, score: 6, minutesAgo: 30 });
  ids.pastS2Best = s2Best.id;
  times.pastS2Last = s2Last.submittedAt;
  // s3: score 8 nhưng GV chấm 0 -> điểm cuối 0.
  const s3 = await newAttempt({ studentId: users.s3, assignmentId: ids.past, score: 8, teacherScore: 0, minutesAgo: 10 });
  ids.pastS3Only = s3.id;
  // s4: không nộp. ghost: nộp 10 điểm nhưng không thuộc lớp.
  await newAttempt({ studentId: users.ghost, assignmentId: ids.past, score: 10, minutesAgo: 5 });

  // --- bài giao còn hạn (future) ---
  // s1: hòa điểm 6/6 -> bestAttemptId phải là lần SỚM hơn.
  const tie1 = await newAttempt({ studentId: users.s1, assignmentId: ids.future, score: 6, minutesAgo: 40 });
  await newAttempt({ studentId: users.s1, assignmentId: ids.future, score: 6, minutesAgo: 20 });
  ids.futureS1Tie1 = tie1.id;
  // s2: một lần nộp chưa có điểm (score null, ví dụ chờ chấm AI).
  const s2Null = await newAttempt({ studentId: users.s2, assignmentId: ids.future, score: null, minutesAgo: 20 });
  ids.futureS2Null = s2Null.id;

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

interface SubBody {
  data: {
    assignment: Record<string, any>;
    totalStudents: number;
    submittedCount: number;
    items: Record<string, any>[];
  } | null;
  error: { code: string; message: string } | null;
}

const getSubmissions = async (idPart: string | number, userId?: number) => {
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;
  const res = await fetch(`${baseUrl}/api/v1/assignments/${idPart}/submissions`, {
    headers,
  });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as SubBody };
};

const itemOf = (body: SubBody, studentId: number) =>
  body.data!.items.find((i) => i.studentId === studentId)!;

describe("GET /api/v1/assignments/:id/submissions - GV chủ lớp", () => {
  it("trả MỌI HS của lớp (kể cả chưa nộp), xếp theo tên, không có ghost", async () => {
    const res = await getSubmissions(ids.past, users.teacher);
    expect(res.status).toBe(200);
    const list = res.body.data!.items.map((i) => i.studentId);
    expect(list).toEqual([users.s1, users.s2, users.s3, users.s4]);
    expect(list).not.toContain(users.ghost);
    expect(res.body.data!.totalStudents).toBe(4);
    expect(res.body.data!.submittedCount).toBe(3); // s1, s2, s3 (ghost không tính, s4 chưa nộp)
  });

  it("phần đầu: thông tin bài giao + lớp + maxAttempts", async () => {
    const res = await getSubmissions(ids.past, users.teacher);
    const a = res.body.data!.assignment;
    expect(Object.keys(a).sort()).toEqual(
      ["assignmentId", "class", "dueAt", "exercise", "maxAttempts"].sort()
    );
    expect(a.assignmentId).toBe(ids.past);
    expect(a.class.id).toBe(ids.classA);
    expect(a.exercise.id).toBe(ids.ex);
    expect(a.maxAttempts).toBe(3);
  });

  it("s1: 3 lần, bestScore 7 ở đúng lần có điểm cao nhất, trễ, lần nộp cuối đúng", async () => {
    const res = await getSubmissions(ids.past, users.teacher);
    const s1 = itemOf(res.body, users.s1);
    expect(s1).toMatchObject({
      status: "SUBMITTED",
      attemptsUsed: 3,
      bestScore: 7,
      bestAttemptId: ids.pastS1Best,
      lateSubmission: true,
    });
    expect(new Date(s1.lastSubmittedAt).getTime()).toBe(times.pastS1Last.getTime());
    expect(s1.name).toBe(`${RUN_ID} s1`);
    expect(s1.email).toBe(`${RUN_ID}_s1@test.local`);
  });

  it("s2: teacher_score 9 ghi đè score 4 -> bestScore 9, bestAttemptId là lần 1", async () => {
    const res = await getSubmissions(ids.past, users.teacher);
    const s2 = itemOf(res.body, users.s2);
    expect(s2).toMatchObject({
      status: "SUBMITTED",
      attemptsUsed: 2,
      bestScore: 9,
      bestAttemptId: ids.pastS2Best,
      lateSubmission: false,
    });
    expect(new Date(s2.lastSubmittedAt).getTime()).toBe(times.pastS2Last.getTime());
  });

  it("s3: teacher_score 0 ghi đè score 8 -> bestScore 0 (không phải 8)", async () => {
    const res = await getSubmissions(ids.past, users.teacher);
    const s3 = itemOf(res.body, users.s3);
    expect(s3.bestScore).toBe(0);
    expect(s3.bestAttemptId).toBe(ids.pastS3Only);
    expect(s3.attemptsUsed).toBe(1);
  });

  it("s4 (không nộp, bài đã quá hạn): OVERDUE, số liệu rỗng", async () => {
    const res = await getSubmissions(ids.past, users.teacher);
    expect(itemOf(res.body, users.s4)).toMatchObject({
      status: "OVERDUE",
      attemptsUsed: 0,
      bestScore: null,
      bestAttemptId: null,
      lastSubmittedAt: null,
      lateSubmission: false,
    });
  });

  it("bài còn hạn: HS chưa nộp là NOT_STARTED; hòa điểm lấy lần sớm nhất; score null -> bestScore/bestAttemptId null", async () => {
    const res = await getSubmissions(ids.future, users.teacher);
    expect(res.status).toBe(200);
    expect(itemOf(res.body, users.s1)).toMatchObject({
      status: "SUBMITTED",
      attemptsUsed: 2,
      bestScore: 6,
      bestAttemptId: ids.futureS1Tie1,
    });
    expect(itemOf(res.body, users.s2)).toMatchObject({
      status: "SUBMITTED",
      attemptsUsed: 1,
      bestScore: null,
      bestAttemptId: null,
    });
    expect(itemOf(res.body, users.s3).status).toBe("NOT_STARTED");
    expect(itemOf(res.body, users.s4).status).toBe("NOT_STARTED");
    expect(res.body.data!.submittedCount).toBe(2);
  });

  it("HS vào lớp SAU khi giao bài vẫn có dòng (chưa làm), số đếm cập nhật", async () => {
    const before = await getSubmissions(ids.join, users.teacher);
    expect(before.body.data!.items.map((i) => i.studentId)).toEqual([users.c1]);

    await prisma.classMember.create({
      data: { classId: ids.classC, studentId: users.c2 },
    });

    const after = await getSubmissions(ids.join, users.teacher);
    expect(after.body.data!.items.map((i) => i.studentId)).toEqual([users.c1, users.c2]);
    expect(after.body.data!.totalStudents).toBe(2);
    expect(after.body.data!.submittedCount).toBe(0);
    expect(itemOf(after.body, users.c2).status).toBe("NOT_STARTED");
  });

  it("đúng field, không thừa; không lộ passwordHash/answer/explanation/mã lớp", async () => {
    const res = await getSubmissions(ids.past, users.teacher);
    expect(Object.keys(res.body.data!).sort()).toEqual(
      ["assignment", "items", "submittedCount", "totalStudents"].sort()
    );
    for (const item of res.body.data!.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          "attemptsUsed",
          "bestAttemptId",
          "bestScore",
          "email",
          "lastSubmittedAt",
          "lateSubmission",
          "name",
          "status",
          "studentId",
        ].sort()
      );
    }
    expect(res.text).not.toContain(PASSWORD_HASH);
    expect(res.text).not.toContain("passwordHash");
    expect(res.text).not.toContain(SECRET_ANSWER);
    expect(res.text).not.toContain(SECRET_EXPLANATION);
    expect(res.text).not.toContain('"answer"');
    expect(res.text).not.toContain('"code"');
  });
});

describe("GET /api/v1/assignments/:id/submissions - không phải chủ lớp -> 404", () => {
  it("GV lớp khác -> 404", async () => {
    const res = await getSubmissions(ids.past, users.teacher2);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
    expect(res.text).not.toContain(users.s1.toString() + ",");
    expect(res.text).not.toContain("@test.local");
  });

  it("GV xem bài giao của lớp GV khác -> 404", async () => {
    const res = await getSubmissions(ids.other, users.teacher);
    expect(res.status).toBe(404);
  });

  it("bài giao không tồn tại -> 404, cùng thông báo với 'của lớp khác' (không lộ id có tồn tại)", async () => {
    const missing = await getSubmissions(2147483000, users.teacher);
    const foreign = await getSubmissions(ids.other, users.teacher);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toEqual(foreign.body.error);
  });
});

describe("GET /api/v1/assignments/:id/submissions - id sai -> 400", () => {
  it.each([["abc"], ["0"], ["-1"], ["1.5"], ["1e3"], ["99999999999"]])(
    "id %j -> 400",
    async (id) => {
      const res = await getSubmissions(id, users.teacher);
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    }
  );
});

describe("GET /api/v1/assignments/:id/submissions - phân quyền", () => {
  it("không token -> 401", async () => {
    const res = await getSubmissions(ids.past);
    expect(res.status).toBe(401);
  });

  it("STUDENT (kể cả HS trong lớp) -> 403", async () => {
    const res = await getSubmissions(ids.past, users.s1);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
    expect(res.text).not.toContain("@test.local");
  });

  it("ADMIN -> 403 (chỉ GV chủ lớp)", async () => {
    const res = await getSubmissions(ids.past, users.admin);
    expect(res.status).toBe(403);
  });

  it("HS gửi id sai vẫn nhận 403 (kiểm quyền trước kiểm id)", async () => {
    const res = await getSubmissions("abc", users.s1);
    expect(res.status).toBe(403);
  });
});