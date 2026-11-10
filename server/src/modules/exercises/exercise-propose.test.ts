/**
 * Test tích hợp POST /api/v1/exercises/:id/propose (GV đề xuất bài: DRAFT -> PROPOSED):
 * gọi API thật (HTTP) + DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo user và bài tập riêng.
 * - Xóa dữ liệu test (kể cả audit_logs) sau khi chạy xong.
 * - Tiền tố "t2pr_" riêng để tránh xóa nhầm dữ liệu test khác.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t2pr_";
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
      topic: `${RUN_ID} topic test PROPOSE`,
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

const readRow = async (id: number) => {
  const row = await prisma.exercise.findUnique({ where: { id } });

  if (!row) {
    throw new Error(`Không thấy bài id=${id} trong DB`);
  }

  return row;
};

// Đếm dòng audit_logs của hành động propose cho một bài (detail.exercise_id)
const countProposeAudits = (exerciseId: number) =>
  prisma.auditLog.count({
    where: {
      action: "exercise.propose",
      detail: { path: ["exercise_id"], equals: exerciseId },
    },
  });

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;

  // audit_logs.user_id chỉ SET NULL khi xóa user, nên phải xóa dòng audit trước
  await prisma.auditLog.deleteMany({
    where: { userId: { in: userIds } },
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
    error: { code: string; message: string } | null;
  };
}

const propose = async (
  id: number | string,
  userId?: number
): Promise<ApiResult> => {
  const headers: Record<string, string> = {};

  if (userId !== undefined) {
    headers.Authorization = `Bearer ${tokenOf(userId)}`;
  }

  const res = await fetch(`${baseUrl}/api/v1/exercises/${id}/propose`, {
    method: "POST",
    headers,
  });

  return {
    status: res.status,
    body: await res.json(),
  };
};

const getExercise = async (id: number, userId: number): Promise<ApiResult> => {
  const res = await fetch(`${baseUrl}/api/v1/exercises/${id}`, {
    headers: { Authorization: `Bearer ${tokenOf(userId)}` },
  });

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
  expect(await countProposeAudits(id)).toBe(0);
};

// ---------------------------------------------------------------------------
// 1. Đề xuất thành công
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/propose - thành công", () => {
  it("GV chủ bài đề xuất bài DRAFT -> 200, PROPOSED, inLibrary vẫn false", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await propose(id, users.teacherA);

    expect(r.status).toBe(200);
    expect(r.body.error).toBeNull();
    expect(Object.keys(r.body.data ?? {}).sort()).toEqual(FULL_KEYS);
    expect(r.body.data?.status).toBe("PROPOSED");
    expect(r.body.data?.inLibrary).toBe(false);

    const after = await readRow(id);

    expect(after.status).toBe("PROPOSED");
    expect(after.inLibrary).toBe(false);
    // Các field khác giữ nguyên
    expect(after.id).toBe(before.id);
    expect(after.createdById).toBe(before.createdById);
    expect(after.content).toEqual(before.content);
    expect(after.answer).toEqual(before.answer);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    // updated_at được cập nhật
    expect(after.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime()
    );
  });

  it("ghi đúng 1 dòng audit_logs (exercise.propose, có exercise_id)", async () => {
    const id = await newExercise();

    expect((await propose(id, users.teacherA)).status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: {
        action: "exercise.propose",
        detail: { path: ["exercise_id"], equals: id },
      },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(users.teacherA);
  });

  it("sau khi đề xuất, bài CHƯA vào thư viện: HS vẫn không thấy (404)", async () => {
    const id = await newExercise();

    await propose(id, users.teacherA);

    const r = await getExercise(id, users.student);

    expect(r.status).toBe(404);
    expect(r.body.error?.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// 2. Sai status -> 409
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/propose - sai status", () => {
  it.each<Status>(["PROPOSED", "PUBLISHED", "HIDDEN"])(
    "bài của mình đang %s -> 409, DB không đổi",
    async (status) => {
      const id = await newExercise({
        status,
        inLibrary: status === "PUBLISHED",
      });
      const before = await readRow(id);

      const r = await propose(id, users.teacherA);

      expect(r.status).toBe(409);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("CONFLICT");

      await expectUnchanged(id, before);
    }
  );

  it("đề xuất hai lần liên tiếp: lần 2 trả 409, không 500, chỉ 1 dòng audit", async () => {
    const id = await newExercise();

    expect((await propose(id, users.teacherA)).status).toBe(200);

    const r = await propose(id, users.teacherA);

    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe("CONFLICT");
    expect(await countProposeAudits(id)).toBe(1);
  });

  it("hai request đồng thời: đúng 1 cái 200, cái còn lại 409", async () => {
    const id = await newExercise();

    const results = await Promise.all([
      propose(id, users.teacherA),
      propose(id, users.teacherA),
    ]);

    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([200, 409]);
    expect((await readRow(id)).status).toBe("PROPOSED");
    expect(await countProposeAudits(id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Quyền truy cập
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/propose - quyền truy cập", () => {
  it("bài DRAFT của GV khác -> 404, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await propose(id, users.teacherB);

    expect(r.status).toBe(404);
    expect(r.body.error?.code).toBe("NOT_FOUND");

    await expectUnchanged(id, before);
  });

  it("bài của GV khác đã PROPOSED vẫn là 404 (không lộ status)", async () => {
    const id = await newExercise({ status: "PROPOSED" });
    const before = await readRow(id);

    const r = await propose(id, users.teacherB);

    expect(r.status).toBe(404);

    await expectUnchanged(id, before);
  });

  it("STUDENT gọi propose -> 403, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await propose(id, users.student);

    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("FORBIDDEN");

    await expectUnchanged(id, before);
  });

  it("ADMIN gọi propose -> 403 (kể cả bài của chính admin), DB không đổi", async () => {
    const teacherExercise = await newExercise();
    const adminExercise = await newExercise({ owner: users.admin });
    const beforeTeacher = await readRow(teacherExercise);
    const beforeAdmin = await readRow(adminExercise);

    const r1 = await propose(teacherExercise, users.admin);
    const r2 = await propose(adminExercise, users.admin);

    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
    expect(r1.body.error?.code).toBe("FORBIDDEN");

    await expectUnchanged(teacherExercise, beforeTeacher);
    await expectUnchanged(adminExercise, beforeAdmin);
  });

  it("không có token -> 401, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await propose(id);

    expect(r.status).toBe(401);

    await expectUnchanged(id, before);
  });
});

// ---------------------------------------------------------------------------
// 4. ID không hợp lệ hoặc không tồn tại
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/propose - kiểm tra ID", () => {
  it("ID sai định dạng -> 400", async () => {
    for (const badId of ["abc", "0", "-1", "1.5", "99999999999"]) {
      const r = await propose(badId, users.teacherA);

      expect(r.status, `id=${badId}`).toBe(400);
      expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("ID không tồn tại -> 404", async () => {
    const r = await propose(2147483647, users.teacherA);

    expect(r.status).toBe(404);
    expect(r.body.error?.code).toBe("NOT_FOUND");
  });
});