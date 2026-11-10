/**
 * Test tích hợp POST /api/v1/exercises/:id/approve (ADMIN duyệt: PROPOSED -> PUBLISHED):
 * gọi API thật (HTTP) + DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo user và bài tập riêng.
 * - Xóa dữ liệu test (kể cả audit_logs) sau khi chạy xong.
 * - Tiền tố "t2ap_" riêng để tránh xóa nhầm dữ liệu test khác.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t2ap_";
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

// Field duy nhất HS được nhận (xem exercise-view.ts)
const STUDENT_KEYS = ["content", "id", "level", "skill", "topic", "type"].sort();

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
      topic: `${RUN_ID} topic test APPROVE`,
      content: { text: "She ___ to school." },
      answer: ["goes"],
      explanation: "Test explanation",
      status: options.status ?? "PROPOSED",
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

// Đếm dòng audit_logs của hành động approve cho một bài (detail.exercise_id)
const countApproveAudits = (exerciseId: number) =>
  prisma.auditLog.count({
    where: {
      action: "exercise.approve",
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

const post = async (
  path: string,
  userId?: number
): Promise<ApiResult> => {
  const headers: Record<string, string> = {};

  if (userId !== undefined) {
    headers.Authorization = `Bearer ${tokenOf(userId)}`;
  }

  const res = await fetch(`${baseUrl}/api/v1/exercises/${path}`, {
    method: "POST",
    headers,
  });

  return {
    status: res.status,
    body: await res.json(),
  };
};

const approve = (id: number | string, userId?: number) =>
  post(`${id}/approve`, userId);

const propose = (id: number | string, userId?: number) =>
  post(`${id}/propose`, userId);

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
  expect(await countApproveAudits(id)).toBe(0);
};

// ---------------------------------------------------------------------------
// 1. Duyệt thành công
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/approve - thành công", () => {
  it("ADMIN duyệt bài PROPOSED -> 200, PUBLISHED, inLibrary true", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await approve(id, users.admin);

    expect(r.status).toBe(200);
    expect(r.body.error).toBeNull();
    expect(Object.keys(r.body.data ?? {}).sort()).toEqual(FULL_KEYS);
    expect(r.body.data?.status).toBe("PUBLISHED");
    expect(r.body.data?.inLibrary).toBe(true);

    const after = await readRow(id);

    expect(after.status).toBe("PUBLISHED");
    expect(after.inLibrary).toBe(true);
    // Các field khác giữ nguyên (người tạo vẫn là GV, không đổi thành admin)
    expect(after.id).toBe(before.id);
    expect(after.createdById).toBe(users.teacherA);
    expect(after.source).toBe("TEACHER");
    expect(after.content).toEqual(before.content);
    expect(after.answer).toEqual(before.answer);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    // updated_at được cập nhật
    expect(after.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime()
    );
  });

  it("ghi đúng 1 dòng audit_logs (exercise.approve, userId = admin)", async () => {
    const id = await newExercise();

    expect((await approve(id, users.admin)).status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: {
        action: "exercise.approve",
        detail: { path: ["exercise_id"], equals: id },
      },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(users.admin);
  });

  it("sau khi duyệt, HS thấy bài trong thư viện và KHÔNG có field answer", async () => {
    const id = await newExercise();

    // Trước khi duyệt: HS chưa thấy
    expect((await getExercise(id, users.student)).status).toBe(404);

    expect((await approve(id, users.admin)).status).toBe(200);

    const r = await getExercise(id, users.student);

    expect(r.status).toBe(200);
    expect(r.body.error).toBeNull();
    expect(Object.keys(r.body.data ?? {}).sort()).toEqual(STUDENT_KEYS);
    expect(r.body.data).not.toHaveProperty("answer");
    expect(r.body.data).not.toHaveProperty("explanation");
  });

  it("sau khi duyệt, GV khác xem thử được bài trong thư viện", async () => {
    const id = await newExercise();

    expect((await getExercise(id, users.teacherB)).status).toBe(404);

    expect((await approve(id, users.admin)).status).toBe(200);

    expect((await getExercise(id, users.teacherB)).status).toBe(200);
  });

  it("luồng đủ qua API: GV propose (DRAFT -> PROPOSED) rồi ADMIN approve", async () => {
    const id = await newExercise({ status: "DRAFT" });

    // Chưa đề xuất thì admin duyệt không được
    expect((await approve(id, users.admin)).status).toBe(409);

    expect((await propose(id, users.teacherA)).status).toBe(200);
    expect((await readRow(id)).status).toBe("PROPOSED");

    const r = await approve(id, users.admin);

    expect(r.status).toBe(200);

    const after = await readRow(id);

    expect(after.status).toBe("PUBLISHED");
    expect(after.inLibrary).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Sai status -> 409
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/approve - sai status", () => {
  it.each<Status>(["DRAFT", "PUBLISHED", "HIDDEN"])(
    "duyệt bài đang %s -> 409, DB không đổi",
    async (status) => {
      const id = await newExercise({
        status,
        inLibrary: status === "PUBLISHED",
      });
      const before = await readRow(id);

      const r = await approve(id, users.admin);

      expect(r.status).toBe(409);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("CONFLICT");

      await expectUnchanged(id, before);
    }
  );

  it("duyệt hai lần liên tiếp: lần 2 trả 409, không 500, chỉ 1 dòng audit", async () => {
    const id = await newExercise();

    expect((await approve(id, users.admin)).status).toBe(200);

    const r = await approve(id, users.admin);

    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe("CONFLICT");
    expect(await countApproveAudits(id)).toBe(1);
  });

  it("hai request duyệt đồng thời: đúng 1 cái 200, cái còn lại 409", async () => {
    const id = await newExercise();

    const results = await Promise.all([
      approve(id, users.admin),
      approve(id, users.admin),
    ]);

    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([200, 409]);
    expect((await readRow(id)).status).toBe("PUBLISHED");
    expect(await countApproveAudits(id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Quyền truy cập
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/approve - quyền truy cập", () => {
  it("GV chủ bài tự duyệt bài của mình -> 403, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await approve(id, users.teacherA);

    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("FORBIDDEN");

    await expectUnchanged(id, before);
  });

  it("GV khác duyệt -> 403, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await approve(id, users.teacherB);

    expect(r.status).toBe(403);

    await expectUnchanged(id, before);
  });

  it("STUDENT duyệt -> 403, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await approve(id, users.student);

    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("FORBIDDEN");

    await expectUnchanged(id, before);
  });

  it("không có token -> 401, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await approve(id);

    expect(r.status).toBe(401);

    await expectUnchanged(id, before);
  });
});

// ---------------------------------------------------------------------------
// 4. ID không hợp lệ hoặc không tồn tại
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/approve - kiểm tra ID", () => {
  it("ID sai định dạng -> 400", async () => {
    for (const badId of ["abc", "0", "-1", "1.5", "99999999999"]) {
      const r = await approve(badId, users.admin);

      expect(r.status, `id=${badId}`).toBe(400);
      expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("ID không tồn tại -> 404", async () => {
    const r = await approve(2147483647, users.admin);

    expect(r.status).toBe(404);
    expect(r.body.error?.code).toBe("NOT_FOUND");
  });
});