/**
 * Test tích hợp GET /api/v1/attempts (danh sách lịch sử bài nộp của chính HS).
 * Gọi API thật (HTTP) + DB PostgreSQL thật; dữ liệu tạo thẳng bằng Prisma.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo user/lớp/bài/assignment/attempts riêng, xóa sạch sau khi chạy.
 * - Tiền tố "t4hs_" riêng để không xóa nhầm dữ liệu của test khác.
 * - GET chi tiết (/:id) có file test riêng ở bước sau.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t4hs_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// Chuỗi "đặc biệt" để dò rò rỉ: nếu response danh sách chứa chúng thì đã lộ.
const SECRET_ANSWER = "zebraquux";
const SECRET_EXPLANATION = "EXPL_secret_zebra";
const SECRET_CORRECTION = "CORR_secret_zebra";
const STUDENT_ANSWER = "mystudentword";
const TEACHER_COMMENT = "COMMENT_secret_zebra";

const users = { admin: 0, teacher: 0, studentA: 0, studentB: 0 };
const ids = {
  classA: 0,
  exA: 0, // bài của bài giao 1
  exB: 0, // bài của bài giao 2
  exC: 0, // bài của bài giao 3
  exP1: 0, // bài tự luyện 1
  exP2: 0, // bài tự luyện 2 (chỉ có lần nộp mode exam)
  asg1: 0,
  asg2: 0,
  asg3: 0,
};
// id các dòng attempts của HS A theo nhãn, để so khớp thứ tự/attemptNo.
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
      content: { text: "She ___ to school." },
      answer: [SECRET_ANSWER],
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

const newAssignment = async (exerciseId: number) => {
  const row = await prisma.assignment.create({
    data: {
      exerciseId,
      classId: ids.classA,
      assignedById: users.teacher,
      dueAt: new Date(Date.now() + 24 * HOUR), // chưa tới hạn
    },
    select: { id: true },
  });
  return row.id;
};

interface NewAttempt {
  studentId: number;
  exerciseId: number;
  assignmentId: number | null;
  mode?: string;
  score: number | null;
  teacherScore?: number | null;
  minute: number; // submitted_at = BASE + minute phút
}

const newAttempt = async (input: NewAttempt) => {
  const row = await prisma.attempt.create({
    data: {
      studentId: input.studentId,
      exerciseId: input.exerciseId,
      assignmentId: input.assignmentId,
      mode: input.mode ?? "practice",
      answer: [STUDENT_ANSWER],
      score: input.score,
      maxScore: 10,
      errors: [
        { type: "vocab", text: STUDENT_ANSWER, correction: SECRET_CORRECTION },
      ],
      teacherScore: input.teacherScore ?? null,
      teacherComment: TEACHER_COMMENT,
      isLate: false,
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

  ids.exA = await newFillBlank("exA", "DRAFT", false);
  ids.exB = await newFillBlank("exB", "DRAFT", false);
  ids.exC = await newFillBlank("exC", "DRAFT", false);
  ids.exP1 = await newFillBlank("exP1", "PUBLISHED", true);
  ids.exP2 = await newFillBlank("exP2", "PUBLISHED", true);
  ids.asg1 = await newAssignment(ids.exA);
  ids.asg2 = await newAssignment(ids.exB);
  ids.asg3 = await newAssignment(ids.exC);

  const a = users.studentA;
  const b = users.studentB;

  // --- HS A, bài giao 1: 3 lần. Cố ý TẠO KHÔNG THEO THỨ TỰ THỜI GIAN để chứng minh
  // attemptNo xếp theo submitted_at chứ không theo id.
  //   lần 3 (phút 30): 6 điểm máy        -> điểm cuối 6   (cao nhất)
  //   lần 1 (phút 10): 4 điểm máy        -> điểm cuối 4
  //   lần 2 (phút 20): 9 điểm máy, GV chấm 4 -> điểm cuối 4 (GV hạ điểm; nếu bỏ qua GV sẽ ra 9)
  A.asg1_n3 = await newAttempt({ studentId: a, exerciseId: ids.exA, assignmentId: ids.asg1, score: 6, minute: 30 });
  A.asg1_n1 = await newAttempt({ studentId: a, exerciseId: ids.exA, assignmentId: ids.asg1, score: 4, minute: 10 });
  A.asg1_n2 = await newAttempt({ studentId: a, exerciseId: ids.exA, assignmentId: ids.asg1, score: 9, teacherScore: 4, minute: 20 });
  // HS B nộp cùng bài giao 1 xen giữa: không được làm đổi attemptNo của A.
  B.asg1_n1 = await newAttempt({ studentId: b, exerciseId: ids.exA, assignmentId: ids.asg1, score: 10, minute: 15 });

  // --- HS A, bài giao 2: lần 1 điểm máy 2 nhưng GV chấm 9 (GV nâng điểm), lần 2 điểm 5.
  A.asg2_n1 = await newAttempt({ studentId: a, exerciseId: ids.exB, assignmentId: ids.asg2, score: 2, teacherScore: 9, minute: 40 });
  A.asg2_n2 = await newAttempt({ studentId: a, exerciseId: ids.exB, assignmentId: ids.asg2, score: 5, minute: 50 });

  // --- HS A, bài giao 3: 1 lần chưa có điểm (score null).
  A.asg3_n1 = await newAttempt({ studentId: a, exerciseId: ids.exC, assignmentId: ids.asg3, score: null, minute: 60 });

  // --- HS A, tự luyện bài P1: 2 lần; lần 2 GV chấm 0 (điểm 0 phải thắng điểm máy 3).
  A.p1_n1 = await newAttempt({ studentId: a, exerciseId: ids.exP1, assignmentId: null, score: 7, minute: 70 });
  A.p1_n2 = await newAttempt({ studentId: a, exerciseId: ids.exP1, assignmentId: null, score: 3, teacherScore: 0, minute: 80 });

  // --- HS A, bài P2: 1 lần mode exam.
  A.p2_n1 = await newAttempt({ studentId: a, exerciseId: ids.exP2, assignmentId: null, mode: "exam", score: 8, minute: 90 });

  // --- HS B, tự luyện bài P1.
  B.p1_n1 = await newAttempt({ studentId: b, exerciseId: ids.exP1, assignmentId: null, score: 10, minute: 95 });

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

interface Item {
  id: number;
  exerciseId: number;
  assignmentId: number | null;
  mode: string;
  attemptNo: number;
  score: number | null;
  maxScore: number;
  teacherScore: number | null;
  finalScore: number | null;
  isLate: boolean;
  submittedAt: string;
}

interface ListData {
  items: Item[];
  page: number;
  limit: number;
  total: number;
  bestScore: number | null;
  attemptsCount: number | null;
}

interface ApiResult {
  status: number;
  raw: string;
  body: {
    data: ListData | null;
    error: { code: string; message: string } | null;
  };
}

const getList = async (query = "", userId?: number): Promise<ApiResult> => {
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;
  const res = await fetch(`${baseUrl}/api/v1/attempts${query}`, { headers });
  const raw = await res.text();
  return { status: res.status, raw, body: JSON.parse(raw) };
};

const dataOf = (r: ApiResult): ListData => {
  expect(r.status, r.raw).toBe(200);
  expect(r.body.error).toBeNull();
  return r.body.data as ListData;
};

const idsOf = (items: Item[]) => items.map((i) => i.id);
const A_COUNT = 9; // số lần nộp của HS A (xem beforeAll)

describe("Chỉ thấy bài nộp của chính mình", () => {
  it("HS A thấy đúng 9 dòng của mình, không có dòng nào của HS B", async () => {
    const data = dataOf(await getList("?limit=50", users.studentA));
    expect(data.total).toBe(A_COUNT);
    expect(data.items).toHaveLength(A_COUNT);
    expect(new Set(idsOf(data.items))).toEqual(new Set(Object.values(A)));
    for (const bid of Object.values(B)) {
      expect(idsOf(data.items)).not.toContain(bid);
    }
  });

  it("HS B chỉ thấy 2 dòng của B, không thấy dòng nào của A", async () => {
    const data = dataOf(await getList("?limit=50", users.studentB));
    expect(data.total).toBe(2);
    expect(new Set(idsOf(data.items))).toEqual(new Set(Object.values(B)));
  });

  it("query studentId của người khác bị bỏ qua: vẫn chỉ ra dữ liệu của người gọi", async () => {
    const data = dataOf(
      await getList(`?limit=50&studentId=${users.studentB}`, users.studentA)
    );
    expect(data.total).toBe(A_COUNT);
    expect(new Set(idsOf(data.items))).toEqual(new Set(Object.values(A)));
  });

  it("HS B lọc theo bài giao mà chỉ A làm (asg2): rỗng, không lộ dữ liệu của A", async () => {
    const data = dataOf(await getList(`?assignmentId=${ids.asg2}`, users.studentB));
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.bestScore).toBeNull();
    expect(data.attemptsCount).toBe(0);
  });
});

describe("Sắp xếp + hình dạng dữ liệu", () => {
  it("submittedAt giảm dần", async () => {
    const data = dataOf(await getList("?limit=50", users.studentA));
    const times = data.items.map((i) => new Date(i.submittedAt).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
    }
    expect(data.items[0].id).toBe(A.p2_n1); // phút 90 là mới nhất
    expect(data.items[data.items.length - 1].id).toBe(A.asg1_n1); // phút 10 là cũ nhất
  });

  it("mặc định page=1, limit=20; response có đủ {items,page,limit,total,bestScore,attemptsCount}", async () => {
    const data = dataOf(await getList("", users.studentA));
    expect(Object.keys(data).sort()).toEqual(
      ["attemptsCount", "bestScore", "items", "limit", "page", "total"].sort()
    );
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
  });

  it("mỗi phần tử chỉ có đúng các field được phép", async () => {
    const data = dataOf(await getList("?limit=50", users.studentA));
    const allowed = [
      "assignmentId",
      "attemptNo",
      "exerciseId",
      "finalScore",
      "id",
      "isLate",
      "maxScore",
      "mode",
      "score",
      "submittedAt",
      "teacherScore",
    ].sort();
    for (const item of data.items) {
      expect(Object.keys(item).sort()).toEqual(allowed);
    }
  });

  it("finalScore = teacherScore nếu có, ngược lại = score (teacherScore 0 vẫn thắng)", async () => {
    const data = dataOf(await getList("?limit=50", users.studentA));
    const byId = new Map(data.items.map((i) => [i.id, i]));
    expect(byId.get(A.asg1_n2)).toMatchObject({ score: 9, teacherScore: 4, finalScore: 4 });
    expect(byId.get(A.asg1_n3)).toMatchObject({ score: 6, teacherScore: null, finalScore: 6 });
    expect(byId.get(A.asg2_n1)).toMatchObject({ score: 2, teacherScore: 9, finalScore: 9 });
    expect(byId.get(A.p1_n2)).toMatchObject({ score: 3, teacherScore: 0, finalScore: 0 });
    expect(byId.get(A.asg3_n1)).toMatchObject({ score: null, teacherScore: null, finalScore: null });
  });
});

describe("Không rò rỉ đáp án / bí mật", () => {
  it("response danh sách không chứa đáp án đúng, explanation, correction, bài làm, nhận xét GV", async () => {
    for (const query of ["?limit=50", `?assignmentId=${ids.asg1}`, `?exerciseId=${ids.exP1}`]) {
      const r = await getList(query, users.studentA);
      expect(r.status).toBe(200);
      for (const secret of [
        SECRET_ANSWER,
        SECRET_EXPLANATION,
        SECRET_CORRECTION,
        STUDENT_ANSWER,
        TEACHER_COMMENT,
      ]) {
        expect(r.raw).not.toContain(secret);
      }
      for (const key of ["answer", "explanation", "correction", "errors", "studentId", "teacherComment", "aiFeedback"]) {
        expect(r.raw).not.toContain(`"${key}"`);
      }
    }
  });

  it("bài giao CHƯA tới hạn: danh sách vẫn không có đáp án", async () => {
    const r = await getList(`?assignmentId=${ids.asg1}`, users.studentA);
    expect(r.status).toBe(200);
    expect(r.raw).not.toContain(SECRET_ANSWER);
    expect(r.raw).not.toContain(SECRET_EXPLANATION);
  });
});

describe("Lọc", () => {
  it("assignmentId: chỉ các lần nộp của bài giao đó", async () => {
    const data = dataOf(await getList(`?assignmentId=${ids.asg1}`, users.studentA));
    expect(data.total).toBe(3);
    expect(new Set(idsOf(data.items))).toEqual(
      new Set([A.asg1_n1, A.asg1_n2, A.asg1_n3])
    );
    for (const item of data.items) expect(item.assignmentId).toBe(ids.asg1);
  });

  it("exerciseId: gồm các lần nộp của bài đó", async () => {
    const data = dataOf(await getList(`?exerciseId=${ids.exP1}`, users.studentA));
    expect(data.total).toBe(2);
    expect(new Set(idsOf(data.items))).toEqual(new Set([A.p1_n1, A.p1_n2]));
    for (const item of data.items) expect(item.exerciseId).toBe(ids.exP1);
  });

  it("mode=exam chỉ ra lần nộp exam; mode=practice không có nó", async () => {
    const exam = dataOf(await getList("?mode=exam", users.studentA));
    expect(idsOf(exam.items)).toEqual([A.p2_n1]);
    expect(exam.total).toBe(1);

    const practice = dataOf(await getList("?mode=practice&limit=50", users.studentA));
    expect(practice.total).toBe(A_COUNT - 1);
    expect(idsOf(practice.items)).not.toContain(A.p2_n1);
  });

  it("kết hợp nhiều lọc (exerciseId + mode)", async () => {
    const none = dataOf(
      await getList(`?exerciseId=${ids.exP2}&mode=practice`, users.studentA)
    );
    expect(none.items).toEqual([]);
    expect(none.total).toBe(0);

    const one = dataOf(
      await getList(`?exerciseId=${ids.exP2}&mode=exam`, users.studentA)
    );
    expect(idsOf(one.items)).toEqual([A.p2_n1]);
  });
});

describe("Phân trang", () => {
  it("limit=2: trang 1..5 đủ 9 dòng (2+2+2+2+1), không trùng, total luôn 9", async () => {
    const seen: number[] = [];
    for (let page = 1; page <= 5; page++) {
      const data = dataOf(await getList(`?limit=2&page=${page}`, users.studentA));
      expect(data.page).toBe(page);
      expect(data.limit).toBe(2);
      expect(data.total).toBe(A_COUNT);
      expect(data.items).toHaveLength(page <= 4 ? 2 : 1);
      seen.push(...idsOf(data.items));
    }
    expect(seen).toHaveLength(A_COUNT);
    expect(new Set(seen).size).toBe(A_COUNT);
    expect(new Set(seen)).toEqual(new Set(Object.values(A)));
  });

  it("trang vượt quá: items rỗng nhưng total vẫn đúng", async () => {
    const data = dataOf(await getList("?limit=2&page=6", users.studentA));
    expect(data.items).toEqual([]);
    expect(data.total).toBe(A_COUNT);
    expect(data.page).toBe(6);
  });

  it("limit=50 (tối đa) được chấp nhận", async () => {
    const data = dataOf(await getList("?limit=50", users.studentA));
    expect(data.limit).toBe(50);
  });
});

describe("attemptNo", () => {
  it("bài giao 1: 1,2,3 theo thời gian nộp (không theo id), không bị HS B làm lệch", async () => {
    const data = dataOf(await getList(`?assignmentId=${ids.asg1}`, users.studentA));
    // Danh sách giảm dần theo thời gian: lần 3, 2, 1
    expect(data.items.map((i) => [i.id, i.attemptNo])).toEqual([
      [A.asg1_n3, 3],
      [A.asg1_n2, 2],
      [A.asg1_n1, 1],
    ]);
  });

  it("mỗi bài giao / mỗi bài tự luyện đánh số riêng", async () => {
    const data = dataOf(await getList("?limit=50", users.studentA));
    const no = new Map(data.items.map((i) => [i.id, i.attemptNo]));
    expect(no.get(A.asg2_n1)).toBe(1);
    expect(no.get(A.asg2_n2)).toBe(2);
    expect(no.get(A.asg3_n1)).toBe(1);
    expect(no.get(A.p1_n1)).toBe(1);
    expect(no.get(A.p1_n2)).toBe(2);
    expect(no.get(A.p2_n1)).toBe(1);
  });

  it("attemptNo không đổi theo bộ lọc hay trang", async () => {
    const all = dataOf(await getList("?limit=50", users.studentA));
    const expected = new Map(all.items.map((i) => [i.id, i.attemptNo]));

    const queries = [
      `?assignmentId=${ids.asg1}`,
      `?exerciseId=${ids.exP1}`,
      "?mode=practice&limit=50",
      "?limit=1&page=3",
      "?limit=2&page=2",
    ];
    for (const query of queries) {
      const data = dataOf(await getList(query, users.studentA));
      for (const item of data.items) {
        expect(item.attemptNo, `${query} id=${item.id}`).toBe(expected.get(item.id));
      }
    }
  });
});

describe("bestScore + attemptsCount", () => {
  it("lọc bài giao 1: bestScore = 6 (GV hạ lần 2 từ 9 xuống 4 nên 9 không được tính)", async () => {
    const data = dataOf(await getList(`?assignmentId=${ids.asg1}`, users.studentA));
    expect(data.bestScore).toBe(6);
    expect(data.attemptsCount).toBe(3);
  });

  it("bestScore tính trên TOÀN BỘ kết quả, kể cả khi lần cao nhất nằm ngoài trang hiện tại", async () => {
    // limit=1: trang 1 = lần 3 (6 điểm, cao nhất), trang 2 = lần 2 (4 điểm), trang 3 = lần 1 (4 điểm)
    const page2 = dataOf(
      await getList(`?assignmentId=${ids.asg1}&limit=1&page=2`, users.studentA)
    );
    expect(idsOf(page2.items)).toEqual([A.asg1_n2]);
    expect(page2.items[0].finalScore).toBe(4);
    expect(page2.bestScore).toBe(6); // lần cao nhất không nằm trong trang này
    expect(page2.attemptsCount).toBe(3);
    expect(page2.total).toBe(3);

    const page3 = dataOf(
      await getList(`?assignmentId=${ids.asg1}&limit=1&page=3`, users.studentA)
    );
    expect(page3.bestScore).toBe(6);
  });

  it("GV nâng điểm (score 2, teacher 9): bestScore = 9, không phải 5", async () => {
    const data = dataOf(await getList(`?assignmentId=${ids.asg2}`, users.studentA));
    expect(data.bestScore).toBe(9);
    expect(data.attemptsCount).toBe(2);
  });

  it("teacher_score = 0 ghi đè điểm máy 3: bài P1 có best = 7 (lần 1), lần 2 tính là 0", async () => {
    const data = dataOf(await getList(`?exerciseId=${ids.exP1}`, users.studentA));
    expect(data.bestScore).toBe(7);
    expect(data.attemptsCount).toBe(2);
  });

  it("lần nộp chưa có điểm: bestScore null nhưng attemptsCount vẫn đếm", async () => {
    const data = dataOf(await getList(`?assignmentId=${ids.asg3}`, users.studentA));
    expect(data.bestScore).toBeNull();
    expect(data.attemptsCount).toBe(1);
  });

  it("KHÔNG lọc assignmentId/exerciseId: bestScore và attemptsCount đều null", async () => {
    for (const query of ["", "?limit=50", "?mode=practice", "?page=2&limit=3"]) {
      const data = dataOf(await getList(query, users.studentA));
      expect(data.bestScore, query).toBeNull();
      expect(data.attemptsCount, query).toBeNull();
    }
  });

  it("bestScore của HS B không bị lẫn điểm HS A (cùng bài giao 1)", async () => {
    const data = dataOf(await getList(`?assignmentId=${ids.asg1}`, users.studentB));
    expect(data.total).toBe(1);
    expect(data.bestScore).toBe(10);
    expect(data.items[0].attemptNo).toBe(1);
  });
});

describe("Quyền", () => {
  it("401: không có token", async () => {
    const r = await getList("");
    expect(r.status).toBe(401);
    expect(r.body.data).toBeNull();
    expect(r.body.error?.code).toBe("UNAUTHORIZED");
  });

  it("401: token sai", async () => {
    const res = await fetch(`${baseUrl}/api/v1/attempts`, {
      headers: { Authorization: "Bearer not.a.token" },
    });
    expect(res.status).toBe(401);
  });

  it("403: TEACHER và ADMIN", async () => {
    for (const userId of [users.teacher, users.admin]) {
      const r = await getList("", userId);
      expect(r.status).toBe(403);
      expect(r.body.error?.code).toBe("FORBIDDEN");
      expect(r.body.data).toBeNull();
    }
  });

  it("403 đứng trước 400: GV gửi query sai vẫn nhận 403", async () => {
    const r = await getList("?limit=9999&assignmentId=abc", users.teacher);
    expect(r.status).toBe(403);
  });
});

describe("400: query sai", () => {
  const bad = [
    "?limit=51",
    "?limit=0",
    "?limit=abc",
    "?page=0",
    "?page=-1",
    "?assignmentId=abc",
    "?assignmentId=0",
    "?assignmentId=1.5",
    "?exerciseId=-1",
    "?exerciseId=",
    "?mode=foo",
    "?assignmentId=1&assignmentId=2",
  ];
  for (const query of bad) {
    it(`${query}`, async () => {
      const r = await getList(query, users.studentA);
      expect(r.status).toBe(400);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    });
  }
});