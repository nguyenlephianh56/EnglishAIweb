
/**
 * Test tích hợp DELETE /api/v1/exercises/:id:
 * gọi API thật (HTTP) + DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo user và bài tập riêng.
 * - Xóa dữ liệu test sau khi chạy xong.
 * - Tiền tố "t2de_" riêng để tránh xóa nhầm dữ liệu test khác.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t2de_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const users = {
  admin: 0,
  teacherA: 0,
  teacherB: 0,
  student: 0,
};

let server: Server;
let baseUrl = "";

const FULL_KEYS = [
  "answer",
  "content",
  "createdAt",
  "createdById",
  "explanation",
  "id",
  "inLibrary",
  "level",
  "skill",
  "source",
  "status",
  "topic",
  "type",
  "updatedAt",
].sort();

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

type Status = "DRAFT" | "PROPOSED" | "PUBLISHED" | "HIDDEN";

const newExercise = async (
  options: {
    owner?: number;
    status?: Status;
    inLibrary?: boolean;
  } = {}
) => {
  const owner = options.owner ?? users.teacherA;

  const row = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} topic test DELETE`,
      content: { text: "She ___ to school." },
      answer: ["goes"],
      explanation: "Test explanation",
      status: options.status ?? "DRAFT",
      source: owner === users.admin ? "ADMIN" : "TEACHER",
      inLibrary: options.inLibrary ?? false,
      createdById: owner,
    },
    select: { id: true },
  });

  return row.id;
};

const addAttempt = async (exerciseId: number) => {
  await prisma.attempt.create({
    data: {
      studentId: users.student,
      exerciseId,
      mode: "practice",
      answer: ["goes"],
      score: 10,
      maxScore: 10,
    },
  });
};

const readRow = async (id: number) => {
  const row = await prisma.exercise.findUnique({ where: { id } });

  if (!row) {
    throw new Error(`Không thấy bài id=${id} trong DB`);
  }

  return row;
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;

  await prisma.attempt.deleteMany({
    where: { studentId: { in: userIds } },
  });

  await prisma.exercise.deleteMany({
    where: { createdById: { in: userIds } },
  });

  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
};

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;

  // Dọn dữ liệu còn sót từ lần chạy trước.
  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });

  await cleanup(leftovers.map((user) => user.id));

  users.admin = await createUser("admin", "ADMIN");
  users.teacherA = await createUser("teacher_a", "TEACHER");
  users.teacherB = await createUser("teacher_b", "TEACHER");
  users.student = await createUser("student", "STUDENT");

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
    await new Promise<void>((resolve) =>
      server.close(() => resolve())
    );
  }

  await cleanup(Object.values(users).filter((id) => id > 0));
  await prisma.$disconnect();
});

const tokenOf = (userId: number) =>
  jwt.sign({ userId }, env.JWT_SECRET);

interface ApiResult {
  status: number;
  body: {
    data: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
  };
}

const remove = async (
  id: number | string,
  userId?: number
): Promise<ApiResult> => {
  const headers: Record<string, string> = {};

  if (userId !== undefined) {
    headers.Authorization = `Bearer ${tokenOf(userId)}`;
  }

  const res = await fetch(
    `${baseUrl}/api/v1/exercises/${id}`,
    {
      method: "DELETE",
      headers,
    }
  );

  return {
    status: res.status,
    body: await res.json(),
  };
};

const getExercise = async (
  id: number,
  userId: number
): Promise<ApiResult> => {
  const res = await fetch(
    `${baseUrl}/api/v1/exercises/${id}`,
    {
      headers: {
        Authorization: `Bearer ${tokenOf(userId)}`,
      },
    }
  );

  return {
    status: res.status,
    body: await res.json(),
  };
};

const expectUnchanged = async (
  id: number,
  before: Awaited<ReturnType<typeof readRow>>
) => {
  expect(await readRow(id)).toEqual(before);
};

// ---------------------------------------------------------------------------
// 1. Ẩn thành công
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/exercises/:id - ẩn bài thành công", () => {
  it("GV chủ bài ẩn bài DRAFT -> 200, status HIDDEN, inLibrary false", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await remove(id, users.teacherA);

    expect(r.status).toBe(200);
    expect(r.body.error).toBeNull();
    expect(Object.keys(r.body.data ?? {}).sort()).toEqual(FULL_KEYS);

    expect(r.body.data?.status).toBe("HIDDEN");
    expect(r.body.data?.inLibrary).toBe(false);

    const after = await readRow(id);

    expect(after.status).toBe("HIDDEN");
    expect(after.inLibrary).toBe(false);
    expect(after.id).toBe(before.id);
    expect(after.createdById).toBe(before.createdById);
    expect(after.content).toEqual(before.content);
    expect(after.answer).toEqual(before.answer);
    expect(after.createdAt.getTime()).toBe(
      before.createdAt.getTime()
    );
    expect(after.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime()
    );
  });

  it("ADMIN ẩn được bài của GV khác", async () => {
    const id = await newExercise();

    const r = await remove(id, users.admin);

    expect(r.status).toBe(200);

    const after = await readRow(id);
    expect(after.status).toBe("HIDDEN");
    expect(after.inLibrary).toBe(false);
  });

  it("GV chủ bài ẩn được bài PUBLISHED đang trong thư viện", async () => {
    const id = await newExercise({
      status: "PUBLISHED",
      inLibrary: true,
    });

    const r = await remove(id, users.teacherA);

    expect(r.status).toBe(200);

    const after = await readRow(id);
    expect(after.status).toBe("HIDDEN");
    expect(after.inLibrary).toBe(false);
  });

  it("GV chủ bài ẩn được bài PROPOSED", async () => {
    const id = await newExercise({
      status: "PROPOSED",
    });

    const r = await remove(id, users.teacherA);

    expect(r.status).toBe(200);
    expect((await readRow(id)).status).toBe("HIDDEN");
  });

  it("bài đã có attempts vẫn ẩn được, attempts vẫn còn", async () => {
    const id = await newExercise();
    await addAttempt(id);

    const r = await remove(id, users.teacherA);

    expect(r.status).toBe(200);
    expect((await readRow(id)).status).toBe("HIDDEN");

    const attempts = await prisma.attempt.count({
      where: { exerciseId: id },
    });

    expect(attempts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Gọi DELETE nhiều lần
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/exercises/:id - bài đã ẩn", () => {
  it("gọi DELETE lần hai vẫn 200 và không cập nhật DB", async () => {
    const id = await newExercise();

    expect((await remove(id, users.teacherA)).status).toBe(200);

    const before = await readRow(id);

    const r = await remove(id, users.teacherA);

    expect(r.status).toBe(200);
    expect(r.body.data?.status).toBe("HIDDEN");

    const after = await readRow(id);

    expect(after).toEqual(before);
  });

  it("bài HIDDEN không còn cho STUDENT xem", async () => {
    const id = await newExercise();

    await remove(id, users.teacherA);

    const r = await getExercise(id, users.student);

    expect(r.status).toBe(404);
    expect(r.body.error?.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// 3. Kiểm tra quyền
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/exercises/:id - quyền truy cập", () => {
  it("GV khác ẩn bài của GV A -> 404, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await remove(id, users.teacherB);

    expect(r.status).toBe(404);
    expect(r.body.error?.code).toBe("NOT_FOUND");

    await expectUnchanged(id, before);
  });

  it("GV không được ẩn bài do ADMIN tạo -> 404", async () => {
    const id = await newExercise({
      owner: users.admin,
    });

    const before = await readRow(id);

    const r = await remove(id, users.teacherA);

    expect(r.status).toBe(404);

    await expectUnchanged(id, before);
  });

  it("STUDENT gọi DELETE -> 403, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await remove(id, users.student);

    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("FORBIDDEN");

    await expectUnchanged(id, before);
  });

  it("không có token -> 401", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await remove(id);

    expect(r.status).toBe(401);

    await expectUnchanged(id, before);
  });
});

// ---------------------------------------------------------------------------
// 4. ID không hợp lệ hoặc không tồn tại
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/exercises/:id - kiểm tra ID", () => {
  it("ID sai định dạng -> 400", async () => {
    for (const badId of [
      "abc",
      "0",
      "-1",
      "1.5",
      "99999999999",
    ]) {
      const r = await remove(badId, users.admin);

      expect(r.status, `id=${badId}`).toBe(400);
      expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("ID không tồn tại -> 404", async () => {
    const r = await remove(2147483647, users.admin);

    expect(r.status).toBe(404);
    expect(r.body.error?.code).toBe("NOT_FOUND");
  });
});
