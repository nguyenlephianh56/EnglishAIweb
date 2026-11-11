/**
 * Test tích hợp GET /api/v1/assignments (danh sách bài giao) cho HS và GV.
 * Gọi API thật (HTTP) + DB PostgreSQL thật; assignment/attempt tạo thẳng bằng Prisma
 * để điều khiển được hạn nộp, điểm, is_late.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo dữ liệu riêng, xóa sạch sau khi chạy. Tiền tố "t5list_" riêng.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t5list_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;

// Chuỗi "đặc biệt" để dò rò rỉ: nếu response chứa chúng thì đã lộ đáp án/giải thích.
const SECRET_ANSWER = "zebraquux";
const SECRET_EXPLANATION = "EXPL_secret_zebra";

const users = {
  admin: 0,
  teacher: 0,
  teacher2: 0,
  s1: 0, // thành viên lớp A và lớp C (của teacher)
  s2: 0, // thành viên lớp A, chưa làm gì
  outsider: 0, // chỉ thuộc lớp B (của teacher2)
  ghost: 0, // có attempt ở bài giao của lớp A nhưng KHÔNG còn là thành viên lớp A
};
const ids = {
  classA: 0,
  classB: 0,
  classC: 0,
  ex1: 0,
  ex2: 0,
  exHidden: 0,
  a1: 0, // lớp A, ex1, hạn +48h, s1 chưa làm
  a2: 0, // lớp A, ex2, hạn +24h, s1 nộp 2 lần (score 4 bị teacher_score 9 ghi đè; lần 2: 6)
  a3: 0, // lớp A, ex1, hạn -24h, không ai làm -> OVERDUE
  a4: 0, // lớp C, ex2, hạn -48h, s1 nộp 3 lần đều trễ (3, 7, 5)
  a5: 0, // lớp B (teacher2), ex1, hạn +24h
  a6: 0, // lớp A, exHidden (HIDDEN), hạn +10h
  a7: 0, // lớp C, ex1, hạn +96h, s1 nộp 1 lần score 8 nhưng teacher_score 0
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

const newExercise = async (
  createdById: number,
  status: "PUBLISHED" | "HIDDEN",
  label: string
) => {
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
      createdById,
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
      remindBeforeH: [24],
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
  teacherScore?: number;
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
      teacherScore: input.teacherScore,
      maxScore: 10,
      isLate: input.isLate ?? false,
      submittedAt: new Date(Date.now() - input.minutesAgo * 60 * 1000),
    },
  });
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  // Thứ tự: attempts -> lớp (cascade xóa assignments + class_members) -> bài -> user
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
  users.ghost = await createUser("ghost", "STUDENT");

  ids.classA = await createClass(users.teacher, "class_a");
  ids.classB = await createClass(users.teacher2, "class_b");
  ids.classC = await createClass(users.teacher, "class_c");

  const member = (classId: number, studentId: number) =>
    prisma.classMember.create({ data: { classId, studentId } });
  await member(ids.classA, users.s1);
  await member(ids.classA, users.s2);
  await member(ids.classC, users.s1);
  await member(ids.classB, users.outsider);
  // ghost KHÔNG là thành viên lớp nào

  ids.ex1 = await newExercise(users.teacher, "PUBLISHED", "ex1");
  ids.ex2 = await newExercise(users.teacher, "PUBLISHED", "ex2");
  ids.exHidden = await newExercise(users.teacher, "HIDDEN", "ex_hidden");

  ids.a1 = await newAssignment(ids.classA, ids.ex1, users.teacher, 48);
  ids.a2 = await newAssignment(ids.classA, ids.ex2, users.teacher, 24);
  ids.a3 = await newAssignment(ids.classA, ids.ex1, users.teacher, -24);
  ids.a4 = await newAssignment(ids.classC, ids.ex2, users.teacher, -48);
  ids.a5 = await newAssignment(ids.classB, ids.ex1, users.teacher2, 24);
  ids.a6 = await newAssignment(ids.classA, ids.exHidden, users.teacher, 10);
  ids.a7 = await newAssignment(ids.classC, ids.ex1, users.teacher, 96);

  // a2: s1 nộp 2 lần. Lần 1: score 4 nhưng GV chấm lại 9 -> điểm cuối 9. Lần 2: 6.
  await newAttempt({ studentId: users.s1, exerciseId: ids.ex2, assignmentId: ids.a2, score: 4, teacherScore: 9, minutesAgo: 60 });
  await newAttempt({ studentId: users.s1, exerciseId: ids.ex2, assignmentId: ids.a2, score: 6, minutesAgo: 30 });
  // a4: s1 nộp 3 lần đều trễ.
  await newAttempt({ studentId: users.s1, exerciseId: ids.ex2, assignmentId: ids.a4, score: 3, isLate: true, minutesAgo: 90 });
  await newAttempt({ studentId: users.s1, exerciseId: ids.ex2, assignmentId: ids.a4, score: 7, isLate: true, minutesAgo: 60 });
  await newAttempt({ studentId: users.s1, exerciseId: ids.ex2, assignmentId: ids.a4, score: 5, isLate: true, minutesAgo: 30 });
  // a7: score 8 nhưng teacher_score 0 -> điểm cuối phải là 0 (không phải 8).
  await newAttempt({ studentId: users.s1, exerciseId: ids.ex1, assignmentId: ids.a7, score: 8, teacherScore: 0, minutesAgo: 10 });
  // ghost nộp a1 nhưng không còn trong lớp A -> không được tính vào submittedCount.
  await newAttempt({ studentId: users.ghost, exerciseId: ids.ex1, assignmentId: ids.a1, score: 10, minutesAgo: 5 });

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

interface ListBody {
  data: {
    items: Record<string, any>[];
    page: number;
    limit: number;
    total: number;
  } | null;
  error: { code: string; message: string } | null;
}

const getList = async (query: string, userId?: number) => {
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;
  const res = await fetch(`${baseUrl}/api/v1/assignments${query}`, { headers });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as ListBody };
};

const idsOf = (body: ListBody) => body.data!.items.map((i) => i.assignmentId);
const byId = (body: ListBody, assignmentId: number) =>
  body.data!.items.find((i) => i.assignmentId === assignmentId)!;

describe("GET /api/v1/assignments - HỌC SINH", () => {
  it("s1 chỉ thấy bài của lớp mình, xếp theo hạn tăng dần, ẩn bài có exercise HIDDEN", async () => {
    const res = await getList("", users.s1);
    expect(res.status).toBe(200);
    // classA: a1(+48) a2(+24) a3(-24) | classC: a4(-48) a7(+96). Không có a5 (lớp B), a6 (HIDDEN).
    expect(idsOf(res.body)).toEqual([ids.a4, ids.a3, ids.a2, ids.a1, ids.a7]);
    expect(res.body.data!.total).toBe(5);
    expect(res.body.data!.page).toBe(1);
    expect(res.body.data!.limit).toBe(20);
  });

  it("status đúng: NOT_STARTED / SUBMITTED / OVERDUE", async () => {
    const res = await getList("", users.s1);
    expect(byId(res.body, ids.a1).status).toBe("NOT_STARTED");
    expect(byId(res.body, ids.a2).status).toBe("SUBMITTED");
    expect(byId(res.body, ids.a3).status).toBe("OVERDUE");
    expect(byId(res.body, ids.a4).status).toBe("SUBMITTED"); // nộp trễ vẫn là SUBMITTED
    expect(byId(res.body, ids.a7).status).toBe("SUBMITTED");
  });

  it("attemptsUsed 0..3, maxAttempts = 3", async () => {
    const res = await getList("", users.s1);
    expect(byId(res.body, ids.a1).attemptsUsed).toBe(0);
    expect(byId(res.body, ids.a2).attemptsUsed).toBe(2);
    expect(byId(res.body, ids.a3).attemptsUsed).toBe(0);
    expect(byId(res.body, ids.a4).attemptsUsed).toBe(3);
    expect(byId(res.body, ids.a7).attemptsUsed).toBe(1);
    for (const item of res.body.data!.items) expect(item.maxAttempts).toBe(3);
  });

  it("bestScore = MAX(COALESCE(teacher_score, score)); teacher_score ghi đè, kể cả 0", async () => {
    const res = await getList("", users.s1);
    expect(byId(res.body, ids.a1).bestScore).toBeNull(); // chưa làm
    expect(byId(res.body, ids.a2).bestScore).toBe(9); // max(9 [teacher ghi đè 4], 6)
    expect(byId(res.body, ids.a3).bestScore).toBeNull();
    expect(byId(res.body, ids.a4).bestScore).toBe(7); // max(3, 7, 5)
    expect(byId(res.body, ids.a7).bestScore).toBe(0); // teacher_score 0 ghi đè score 8
  });

  it("lateSubmission = true chỉ khi có attempt is_late", async () => {
    const res = await getList("", users.s1);
    expect(byId(res.body, ids.a4).lateSubmission).toBe(true);
    expect(byId(res.body, ids.a2).lateSubmission).toBe(false);
    expect(byId(res.body, ids.a1).lateSubmission).toBe(false);
    expect(byId(res.body, ids.a3).lateSubmission).toBe(false); // OVERDUE nhưng chưa nộp
  });

  it("s2 (chưa làm gì): không thấy lớp C; trạng thái và điểm đúng", async () => {
    const res = await getList("", users.s2);
    expect(idsOf(res.body)).toEqual([ids.a3, ids.a2, ids.a1]);
    expect(byId(res.body, ids.a1).status).toBe("NOT_STARTED");
    expect(byId(res.body, ids.a2).status).toBe("NOT_STARTED"); // attempt của s1 không tính cho s2
    expect(byId(res.body, ids.a2).attemptsUsed).toBe(0);
    expect(byId(res.body, ids.a2).bestScore).toBeNull();
    expect(byId(res.body, ids.a3).status).toBe("OVERDUE");
  });

  it("outsider chỉ thấy bài của lớp B", async () => {
    const res = await getList("", users.outsider);
    expect(idsOf(res.body)).toEqual([ids.a5]);
  });

  it("lọc status", async () => {
    const submitted = await getList("?status=SUBMITTED", users.s1);
    expect(idsOf(submitted.body)).toEqual([ids.a4, ids.a2, ids.a7]);
    expect(submitted.body.data!.total).toBe(3);

    const overdue = await getList("?status=OVERDUE", users.s1);
    expect(idsOf(overdue.body)).toEqual([ids.a3]);

    const notStarted = await getList("?status=NOT_STARTED", users.s1);
    expect(idsOf(notStarted.body)).toEqual([ids.a1]);
  });

  it("lọc classId, và kết hợp classId + status", async () => {
    const classC = await getList(`?classId=${ids.classC}`, users.s1);
    expect(idsOf(classC.body)).toEqual([ids.a4, ids.a7]);

    const combo = await getList(
      `?classId=${ids.classA}&status=SUBMITTED`,
      users.s1
    );
    expect(idsOf(combo.body)).toEqual([ids.a2]);
  });

  it("lọc classId của lớp mình không thuộc -> rỗng, không lỗi", async () => {
    const res = await getList(`?classId=${ids.classB}`, users.s1);
    expect(res.status).toBe(200);
    expect(res.body.data!.items).toEqual([]);
    expect(res.body.data!.total).toBe(0);
  });

  it("phân trang: total giữ nguyên, các trang nối nhau đúng thứ tự", async () => {
    const p1 = await getList("?page=1&limit=2", users.s1);
    const p2 = await getList("?page=2&limit=2", users.s1);
    const p3 = await getList("?page=3&limit=2", users.s1);
    const p4 = await getList("?page=4&limit=2", users.s1);
    expect(idsOf(p1.body)).toEqual([ids.a4, ids.a3]);
    expect(idsOf(p2.body)).toEqual([ids.a2, ids.a1]);
    expect(idsOf(p3.body)).toEqual([ids.a7]);
    expect(idsOf(p4.body)).toEqual([]);
    for (const p of [p1, p2, p3, p4]) expect(p.body.data!.total).toBe(5);
    expect(p2.body.data!.page).toBe(2);
    expect(p2.body.data!.limit).toBe(2);
  });

  it("phân trang kết hợp lọc status (lọc làm ở DB nên total đúng)", async () => {
    const p1 = await getList("?status=SUBMITTED&page=1&limit=2", users.s1);
    const p2 = await getList("?status=SUBMITTED&page=2&limit=2", users.s1);
    expect(idsOf(p1.body)).toEqual([ids.a4, ids.a2]);
    expect(idsOf(p2.body)).toEqual([ids.a7]);
    expect(p1.body.data!.total).toBe(3);
  });

  it("KHÔNG rò rỉ: không có answer/explanation/content/mã lớp trong response", async () => {
    const res = await getList("?limit=50", users.s1);
    expect(res.text).not.toContain(SECRET_ANSWER);
    expect(res.text).not.toContain(SECRET_EXPLANATION);
    expect(res.text).not.toContain('"answer"');
    expect(res.text).not.toContain('"explanation"');
    expect(res.text).not.toContain('"content"');
    expect(res.text).not.toContain('"code"');
    expect(res.text).not.toContain("passwordHash");
    for (const item of res.body.data!.items) {
      expect(Object.keys(item).sort()).toEqual(
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
      expect(Object.keys(item.exercise).sort()).toEqual(
        ["id", "level", "skill", "topic", "type"].sort()
      );
      expect(Object.keys(item.class).sort()).toEqual(["id", "name"]);
    }
  });

  it("query sai -> 400", async () => {
    for (const q of [
      "?status=FOO",
      "?status=overdue",
      "?limit=51",
      "?limit=0",
      "?page=0",
      "?page=abc",
      "?classId=abc",
      "?classId=-1",
    ]) {
      const res = await getList(q, users.s1);
      expect(res.status, q).toBe(400);
      expect(res.body.error?.code, q).toBe("VALIDATION_ERROR");
    }
  });

  it("gửi studentId trong query không đổi được người xem (luôn lấy từ token)", async () => {
    const res = await getList(`?studentId=${users.outsider}`, users.s1);
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual([ids.a4, ids.a3, ids.a2, ids.a1, ids.a7]);
  });
});

describe("GET /api/v1/assignments - GIÁO VIÊN", () => {
  it("teacher thấy bài của lớp mình (cả bài exercise HIDDEN), hạn giảm dần, không thấy lớp GV khác", async () => {
    const res = await getList("", users.teacher);
    expect(res.status).toBe(200);
    // a7(+96) a1(+48) a2(+24) a6(+10) a3(-24) a4(-48). Không có a5 (lớp của teacher2).
    expect(idsOf(res.body)).toEqual([ids.a7, ids.a1, ids.a2, ids.a6, ids.a3, ids.a4]);
    expect(res.body.data!.total).toBe(6);
  });

  it("submittedCount / totalStudents đúng; HS đã rời lớp không được tính", async () => {
    const res = await getList("", users.teacher);
    // Lớp A có 2 HS (s1, s2); lớp C có 1 HS (s1).
    expect(byId(res.body, ids.a1)).toMatchObject({ submittedCount: 0, totalStudents: 2 }); // ghost đã nộp nhưng không còn trong lớp
    expect(byId(res.body, ids.a2)).toMatchObject({ submittedCount: 1, totalStudents: 2 });
    expect(byId(res.body, ids.a3)).toMatchObject({ submittedCount: 0, totalStudents: 2 });
    expect(byId(res.body, ids.a4)).toMatchObject({ submittedCount: 1, totalStudents: 1 }); // 3 lần nộp, vẫn tính 1 HS
    expect(byId(res.body, ids.a7)).toMatchObject({ submittedCount: 1, totalStudents: 1 });
  });

  it("lọc classId; classId của GV khác -> rỗng", async () => {
    const a = await getList(`?classId=${ids.classA}`, users.teacher);
    expect(idsOf(a.body)).toEqual([ids.a1, ids.a2, ids.a6, ids.a3]);

    const other = await getList(`?classId=${ids.classB}`, users.teacher);
    expect(other.status).toBe(200);
    expect(other.body.data!.items).toEqual([]);
  });

  it("phân trang", async () => {
    const p1 = await getList("?page=1&limit=4", users.teacher);
    const p2 = await getList("?page=2&limit=4", users.teacher);
    expect(idsOf(p1.body)).toEqual([ids.a7, ids.a1, ids.a2, ids.a6]);
    expect(idsOf(p2.body)).toEqual([ids.a3, ids.a4]);
    expect(p2.body.data!.total).toBe(6);
  });

  it("status trong query bị bỏ qua với GV (không lỗi)", async () => {
    const res = await getList("?status=OVERDUE", users.teacher);
    expect(res.status).toBe(200);
    expect(res.body.data!.total).toBe(6);
  });

  it("teacher2 chỉ thấy bài lớp B; không thấy bài của teacher", async () => {
    const res = await getList("", users.teacher2);
    expect(idsOf(res.body)).toEqual([ids.a5]);
    expect(byId(res.body, ids.a5)).toMatchObject({ submittedCount: 0, totalStudents: 1 });
  });

  it("không có answer/explanation/content/mã lớp/passwordHash; đủ field", async () => {
    const res = await getList("?limit=50", users.teacher);
    expect(res.text).not.toContain(SECRET_ANSWER);
    expect(res.text).not.toContain(SECRET_EXPLANATION);
    expect(res.text).not.toContain('"answer"');
    expect(res.text).not.toContain('"explanation"');
    expect(res.text).not.toContain('"content"');
    expect(res.text).not.toContain('"code"');
    expect(res.text).not.toContain("passwordHash");
    for (const item of res.body.data!.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          "assignmentId",
          "class",
          "createdAt",
          "dueAt",
          "exercise",
          "remindBeforeHours",
          "submittedCount",
          "totalStudents",
        ].sort()
      );
    }
  });
});

describe("GET /api/v1/assignments - phân quyền", () => {
  it("không token -> 401", async () => {
    const res = await getList("");
    expect(res.status).toBe(401);
  });

  it("ADMIN -> 403", async () => {
    const res = await getList("", users.admin);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("ADMIN gửi query sai vẫn nhận 403 (kiểm quyền trước kiểm query)", async () => {
    const res = await getList("?limit=999", users.admin);
    expect(res.status).toBe(403);
  });
});