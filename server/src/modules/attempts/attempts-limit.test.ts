/**
 * Test tích hợp: giới hạn 3 lần nộp / HS / bài giao (Project.md 4c.3).
 * Gọi API thật (HTTP) + DB PostgreSQL thật; assignment tạo thẳng bằng Prisma.
 *
 * - Tiền tố "t4lim_" riêng để không xóa nhầm dữ liệu của test khác.
 * - Tự tạo user/lớp/bài/assignment riêng, xóa sạch sau khi chạy.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { MAX_ATTEMPTS_PER_ASSIGNMENT } from "./attempts.constants";

const PREFIX = "t4lim_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// Bài có 2 chỗ trống: đáp án đúng là RIGHT. Điểm = số chỗ đúng / 2 × 10.
const RIGHT = ["goes", "school"];
const ANSWER_SCORE_0 = ["xxx", "yyy"];
const ANSWER_SCORE_5 = ["goes", "yyy"];
const ANSWER_SCORE_10 = RIGHT;

const HOUR = 60 * 60 * 1000;

const users = { teacher: 0, studentA: 0, studentB: 0 };
const ids = { classId: 0, exerciseId: 0 };

let server: Server;
let baseUrl = "";

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

// Mã lớp: 6 ký tự HOA/số (DB có CHECK).
const randomClassCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

// Thứ tự: attempts -> lớp (cascade xóa assignments + class_members) -> bài -> user
const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.class.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;

  // Dọn rác lần chạy trước. Lọc lại bằng code vì "_" trong LIKE là ký tự đại diện.
  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true, email: true },
  });
  await cleanup(
    leftovers
      .filter((u: { email: string }) => u.email.startsWith(PREFIX))
      .map((u: { id: number }) => u.id)
  );

  users.teacher = await createUser("teacher", "TEACHER");
  users.studentA = await createUser("student_a", "STUDENT");
  users.studentB = await createUser("student_b", "STUDENT");

  const cls = await prisma.class.create({
    data: {
      name: `${RUN_ID} class`,
      code: randomClassCode(),
      teacherId: users.teacher,
    },
    select: { id: true },
  });
  ids.classId = cls.id;
  await prisma.classMember.create({
    data: { classId: ids.classId, studentId: users.studentA },
  });
  await prisma.classMember.create({
    data: { classId: ids.classId, studentId: users.studentB },
  });

  // PUBLISHED + in_library để vừa làm bài giao vừa tự luyện được.
  const exercise = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} fill_blank`,
      content: { text: "She ___ to ___." },
      answer: RIGHT,
      explanation: "Giải thích mẫu.",
      status: "PUBLISHED",
      source: "TEACHER",
      inLibrary: true,
      createdById: users.teacher,
    },
    select: { id: true },
  });
  ids.exerciseId = exercise.id;

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

interface ApiResult {
  status: number;
  body: {
    data: Record<string, unknown> | null;
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    } | null;
  };
}

const postAttempt = async (
  body: unknown,
  userId: number
): Promise<ApiResult> => {
  const res = await fetch(`${baseUrl}/api/v1/attempts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenOf(userId)}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const newAssignment = (dueOffsetMs: number) =>
  prisma.assignment.create({
    data: {
      exerciseId: ids.exerciseId,
      classId: ids.classId,
      assignedById: users.teacher,
      dueAt: new Date(Date.now() + dueOffsetMs),
    },
    select: { id: true },
  });

const submit = (assignmentId: number, answer: unknown, userId: number) =>
  postAttempt({ assignmentId, answer }, userId);

const rowsOf = (studentId: number, assignmentId: number) =>
  prisma.attempt.findMany({
    where: { studentId, assignmentId },
    orderBy: { id: "asc" },
  });

const countOf = (studentId: number, assignmentId: number) =>
  prisma.attempt.count({ where: { studentId, assignmentId } });

// ---------------------------------------------------------------------------
describe("Giới hạn 3 lần nộp bài giao", () => {
  it("hằng số cấu hình là 3", () => {
    expect(MAX_ATTEMPTS_PER_ASSIGNMENT).toBe(3);
  });

  it("lần 1, 2, 3 -> 201, attemptNo 1/2/3, attemptsLeft 2/1/0; DB đúng 3 dòng, điểm lưu riêng", async () => {
    const a = await newAssignment(HOUR);
    const answers = [ANSWER_SCORE_0, ANSWER_SCORE_5, ANSWER_SCORE_10];
    const expectedScores = [0, 5, 10];

    for (let i = 0; i < 3; i++) {
      const res = await submit(a.id, answers[i], users.studentA);
      expect(res.status).toBe(201);
      expect(res.body.error).toBeNull();
      expect(res.body.data?.attemptNo).toBe(i + 1);
      expect(res.body.data?.attemptsLeft).toBe(2 - i);
      expect(res.body.data?.score).toBe(expectedScores[i]);
      // Che đáp án trước hạn vẫn giữ nguyên
      expect("answer" in (res.body.data as object)).toBe(false);
      expect("explanation" in (res.body.data as object)).toBe(false);
    }

    const rows = await rowsOf(users.studentA, a.id);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.score)).toEqual(expectedScores);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3); // 3 dòng khác nhau, không ghi đè
  });

  it("lần 4 -> 409 ATTEMPT_LIMIT_REACHED, kèm details, DB vẫn 3 dòng", async () => {
    const a = await newAssignment(HOUR);
    for (let i = 0; i < 3; i++) {
      expect((await submit(a.id, ANSWER_SCORE_10, users.studentA)).status).toBe(201);
    }

    const res = await submit(a.id, ANSWER_SCORE_10, users.studentA);
    expect(res.status).toBe(409);
    expect(res.body.data).toBeNull();
    expect(res.body.error?.code).toBe("ATTEMPT_LIMIT_REACHED");
    expect(res.body.error?.message).toBe("Bạn đã dùng hết 3 lần nộp cho bài này");
    expect(res.body.error?.details).toEqual({ attemptsUsed: 3, max: 3 });
    expect(await countOf(users.studentA, a.id)).toBe(3);
  });

  it("lần 4 không bị chấm: bài làm sai hình dạng vẫn nhận 409 (không phải 400)", async () => {
    const a = await newAssignment(HOUR);
    for (let i = 0; i < 3; i++) {
      await submit(a.id, ANSWER_SCORE_10, users.studentA);
    }
    const res = await submit(a.id, "khong-phai-mang", users.studentA);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("ATTEMPT_LIMIT_REACHED");
    expect(await countOf(users.studentA, a.id)).toBe(3);
  });

  it("lần nộp bị 400/404 KHÔNG tính vào số lần", async () => {
    const a = await newAssignment(HOUR);

    // 400: bài làm sai hình dạng
    const badShape = await submit(a.id, "khong-phai-mang", users.studentA);
    expect(badShape.status).toBe(400);
    // 400: exerciseId lệch với assignment
    const mismatch = await postAttempt(
      { assignmentId: a.id, exerciseId: ids.exerciseId + 1_000_000, answer: RIGHT },
      users.studentA
    );
    expect(mismatch.status).toBe(400);
    // 404: assignment không tồn tại
    const missing = await submit(2_000_000_000, RIGHT, users.studentA);
    expect(missing.status).toBe(404);

    expect(await countOf(users.studentA, a.id)).toBe(0);

    // Sau các lần lỗi vẫn đủ 3 lần hợp lệ, attemptNo bắt đầu từ 1
    for (let i = 0; i < 3; i++) {
      const res = await submit(a.id, ANSWER_SCORE_10, users.studentA);
      expect(res.status).toBe(201);
      expect(res.body.data?.attemptNo).toBe(i + 1);
    }
    expect(await countOf(users.studentA, a.id)).toBe(3);
  });

  it("HS A hết lượt không ảnh hưởng HS B cùng bài", async () => {
    const a = await newAssignment(HOUR);
    for (let i = 0; i < 3; i++) {
      await submit(a.id, ANSWER_SCORE_10, users.studentA);
    }
    expect((await submit(a.id, ANSWER_SCORE_10, users.studentA)).status).toBe(409);

    const b = await submit(a.id, ANSWER_SCORE_10, users.studentB);
    expect(b.status).toBe(201);
    expect(b.body.data?.attemptNo).toBe(1);
    expect(b.body.data?.attemptsLeft).toBe(2);
    expect(await countOf(users.studentB, a.id)).toBe(1);
    expect(await countOf(users.studentA, a.id)).toBe(3);
  });

  it("cùng HS ở assignment khác vẫn có đủ 3 lần", async () => {
    const first = await newAssignment(HOUR);
    const second = await newAssignment(HOUR);
    for (let i = 0; i < 3; i++) {
      await submit(first.id, ANSWER_SCORE_10, users.studentA);
    }
    expect((await submit(first.id, ANSWER_SCORE_10, users.studentA)).status).toBe(409);

    for (let i = 0; i < 3; i++) {
      const res = await submit(second.id, ANSWER_SCORE_10, users.studentA);
      expect(res.status).toBe(201);
      expect(res.body.data?.attemptNo).toBe(i + 1);
    }
    expect(await countOf(users.studentA, second.id)).toBe(3);
  });

  it("nộp trễ hạn vẫn tính lượt (lần 1 đúng hạn, lần 2-3 trễ, lần 4 bị chặn)", async () => {
    const a = await newAssignment(HOUR);

    const first = await submit(a.id, ANSWER_SCORE_10, users.studentA);
    expect(first.status).toBe(201);
    expect(first.body.data?.attemptNo).toBe(1);

    // Đẩy hạn về quá khứ để các lần sau là nộp trễ
    await prisma.assignment.update({
      where: { id: a.id },
      data: { dueAt: new Date(Date.now() - HOUR) },
    });

    const second = await submit(a.id, ANSWER_SCORE_10, users.studentA);
    const third = await submit(a.id, ANSWER_SCORE_10, users.studentA);
    expect(second.status).toBe(201);
    expect(second.body.data?.attemptNo).toBe(2);
    expect(third.status).toBe(201);
    expect(third.body.data?.attemptNo).toBe(3);
    expect(third.body.data?.attemptsLeft).toBe(0);

    expect((await submit(a.id, ANSWER_SCORE_10, users.studentA)).status).toBe(409);

    const rows = await rowsOf(users.studentA, a.id);
    expect(rows.map((r) => r.isLate)).toEqual([false, true, true]);
  });
});

// ---------------------------------------------------------------------------
describe("Tự luyện: không giới hạn (không hồi quy)", () => {
  it("nộp 5 lần vẫn 201, không có attemptNo/attemptsLeft", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await postAttempt(
        { exerciseId: ids.exerciseId, answer: ANSWER_SCORE_10 },
        users.studentA
      );
      expect(res.status).toBe(201);
      expect("attemptNo" in (res.body.data as object)).toBe(false);
      expect("attemptsLeft" in (res.body.data as object)).toBe(false);
    }
    const count = await prisma.attempt.count({
      where: {
        studentId: users.studentA,
        exerciseId: ids.exerciseId,
        assignmentId: null,
      },
    });
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
describe("Nộp song song", () => {
  const toNumber = (v: unknown) => Number(v);

  it("5 request song song cho một bài giao: đúng 3 thành công, 2 bị 409, DB đúng 3 dòng", async () => {
    const a = await newAssignment(HOUR);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        submit(a.id, ANSWER_SCORE_10, users.studentA)
      )
    );

    // Không có lỗi 500 hay mã nào khác ngoài 201 và 409
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 409, 409]);

    const ok = results.filter((r) => r.status === 201);
    expect(
      ok.map((r) => toNumber(r.body.data?.attemptNo)).sort((x, y) => x - y)
    ).toEqual([1, 2, 3]);
    for (const r of results.filter((r) => r.status === 409)) {
      expect(r.body.error?.code).toBe("ATTEMPT_LIMIT_REACHED");
    }

    expect(await countOf(users.studentA, a.id)).toBe(3);
  });

  it("2 HS cùng gửi song song (mỗi HS 5 request): mỗi HS đúng 3 thành công", async () => {
    const a = await newAssignment(HOUR);

    const [resA, resB] = await Promise.all([
      Promise.all(
        Array.from({ length: 5 }, () => submit(a.id, ANSWER_SCORE_10, users.studentA))
      ),
      Promise.all(
        Array.from({ length: 5 }, () => submit(a.id, ANSWER_SCORE_10, users.studentB))
      ),
    ]);

    for (const results of [resA, resB]) {
      expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 409, 409]);
    }
    expect(await countOf(users.studentA, a.id)).toBe(3);
    expect(await countOf(users.studentB, a.id)).toBe(3);
  });
});