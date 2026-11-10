/**
 * Test tích hợp POST /api/v1/exercises/:id/reject (ADMIN từ chối: PROPOSED -> DRAFT):
 * gọi API thật (HTTP) + DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo user và bài tập riêng.
 * - Xóa dữ liệu test (kể cả audit_logs) sau khi chạy xong.
 * - Tiền tố "t2rj_" riêng để tránh xóa nhầm dữ liệu test khác.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t2rj_";
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
      topic: `${RUN_ID} topic test REJECT`,
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

// Các dòng audit_logs của hành động reject cho một bài (detail.exercise_id)
const rejectAudits = (exerciseId: number) =>
  prisma.auditLog.findMany({
    where: {
      action: "exercise.reject",
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

// body === undefined: không gửi body. Ngược lại gửi JSON.
const post = async (
  path: string,
  userId?: number,
  body?: unknown
): Promise<ApiResult> => {
  const headers: Record<string, string> = {};

  if (userId !== undefined) {
    headers.Authorization = `Bearer ${tokenOf(userId)}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${baseUrl}/api/v1/exercises/${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    status: res.status,
    body: await res.json(),
  };
};

const reject = (id: number | string, userId?: number, body?: unknown) =>
  post(`${id}/reject`, userId, body);

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
  expect(await rejectAudits(id)).toHaveLength(0);
};

// ---------------------------------------------------------------------------
// 1. Từ chối thành công
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/reject - thành công", () => {
  it("ADMIN từ chối bài PROPOSED (không gửi body) -> 200, DRAFT, inLibrary false", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await reject(id, users.admin);

    expect(r.status).toBe(200);
    expect(r.body.error).toBeNull();
    expect(Object.keys(r.body.data ?? {}).sort()).toEqual(FULL_KEYS);
    expect(r.body.data?.status).toBe("DRAFT");
    expect(r.body.data?.inLibrary).toBe(false);

    const after = await readRow(id);

    expect(after.status).toBe("DRAFT");
    expect(after.inLibrary).toBe(false);
    // Các field khác giữ nguyên
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

  it("không có reason: audit có đúng 1 dòng, reason = null", async () => {
    const id = await newExercise();

    expect((await reject(id, users.admin)).status).toBe(200);

    const logs = await rejectAudits(id);

    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(users.admin);
    expect(logs[0].detail).toMatchObject({
      exercise_id: id,
      from: "PROPOSED",
      to: "DRAFT",
      reason: null,
    });
  });

  it("có reason: được trim và lưu vào audit_logs", async () => {
    const id = await newExercise();

    const r = await reject(id, users.admin, {
      reason: "  Đáp án sai ở câu 2  ",
    });

    expect(r.status).toBe(200);

    const logs = await rejectAudits(id);

    expect(logs).toHaveLength(1);
    expect(logs[0].detail).toMatchObject({
      exercise_id: id,
      reason: "Đáp án sai ở câu 2",
    });
  });

  it("reason rỗng, chỉ có khoảng trắng hoặc null -> coi như không có lý do", async () => {
    for (const reason of ["", "   ", null]) {
      const id = await newExercise();

      const r = await reject(id, users.admin, { reason });

      expect(r.status, `reason=${JSON.stringify(reason)}`).toBe(200);

      const logs = await rejectAudits(id);

      expect(logs[0].detail).toMatchObject({ reason: null });
    }
  });

  it("body {} vẫn hợp lệ", async () => {
    const id = await newExercise();

    const r = await reject(id, users.admin, {});

    expect(r.status).toBe(200);
  });

  it("field thừa trong body (status, inLibrary) bị bỏ qua, không lọt vào DB", async () => {
    const id = await newExercise();

    const r = await reject(id, users.admin, {
      reason: "x",
      status: "PUBLISHED",
      inLibrary: true,
    });

    expect(r.status).toBe(200);

    const after = await readRow(id);

    expect(after.status).toBe("DRAFT");
    expect(after.inLibrary).toBe(false);
  });

  it("sau khi từ chối: HS không thấy bài; GV chủ bài vẫn thấy (DRAFT)", async () => {
    const id = await newExercise();

    expect((await reject(id, users.admin)).status).toBe(200);

    expect((await getExercise(id, users.student)).status).toBe(404);

    const owner = await getExercise(id, users.teacherA);

    expect(owner.status).toBe(200);
    expect(owner.body.data?.status).toBe("DRAFT");
  });

  it("GV chủ bài đề xuất lại được sau khi bị từ chối, rồi admin duyệt", async () => {
    const id = await newExercise();

    expect((await reject(id, users.admin, { reason: "Sửa lại" })).status).toBe(
      200
    );

    // DRAFT -> PROPOSED lần 2
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
// 2. Body không hợp lệ -> 400
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/reject - body không hợp lệ", () => {
  it("reason không phải chuỗi -> 400, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await reject(id, users.admin, { reason: 123 });

    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    expect(r.body.error?.message).toContain("reason");

    await expectUnchanged(id, before);
  });

  it("reason quá 1000 ký tự -> 400, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await reject(id, users.admin, { reason: "a".repeat(1001) });

    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe("VALIDATION_ERROR");

    await expectUnchanged(id, before);
  });

  it("reason đúng 1000 ký tự vẫn hợp lệ", async () => {
    const id = await newExercise();

    const r = await reject(id, users.admin, { reason: "a".repeat(1000) });

    expect(r.status).toBe(200);
  });

  it("body là mảng -> 400, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await reject(id, users.admin, []);

    expect(r.status).toBe(400);

    await expectUnchanged(id, before);
  });
});

// ---------------------------------------------------------------------------
// 3. Sai status -> 409
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/reject - sai status", () => {
  it.each<Status>(["DRAFT", "PUBLISHED", "HIDDEN"])(
    "từ chối bài đang %s -> 409, DB không đổi",
    async (status) => {
      const id = await newExercise({
        status,
        inLibrary: status === "PUBLISHED",
      });
      const before = await readRow(id);

      const r = await reject(id, users.admin);

      expect(r.status).toBe(409);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("CONFLICT");

      await expectUnchanged(id, before);
    }
  );

  it("từ chối hai lần liên tiếp: lần 2 trả 409, không 500, chỉ 1 dòng audit", async () => {
    const id = await newExercise();

    expect((await reject(id, users.admin)).status).toBe(200);

    const r = await reject(id, users.admin);

    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe("CONFLICT");
    expect(await rejectAudits(id)).toHaveLength(1);
  });

  it("hai request từ chối đồng thời: đúng 1 cái 200, cái còn lại 409", async () => {
    const id = await newExercise();

    const results = await Promise.all([
      reject(id, users.admin),
      reject(id, users.admin),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await readRow(id)).status).toBe("DRAFT");
    expect(await rejectAudits(id)).toHaveLength(1);
  });

  it("approve và reject đồng thời: đúng 1 bên thắng, trạng thái cuối khớp bên thắng", async () => {
    const id = await newExercise();

    const [approveResult, rejectResult] = await Promise.all([
      approve(id, users.admin),
      reject(id, users.admin),
    ]);

    expect([approveResult.status, rejectResult.status].sort()).toEqual([
      200, 409,
    ]);

    const after = await readRow(id);

    if (approveResult.status === 200) {
      expect(after.status).toBe("PUBLISHED");
      expect(after.inLibrary).toBe(true);
    } else {
      expect(after.status).toBe("DRAFT");
      expect(after.inLibrary).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Quyền truy cập
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/reject - quyền truy cập", () => {
  it("GV chủ bài gọi reject -> 403, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await reject(id, users.teacherA);

    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("FORBIDDEN");

    await expectUnchanged(id, before);
  });

  it("GV khác gọi reject -> 403, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await reject(id, users.teacherB);

    expect(r.status).toBe(403);

    await expectUnchanged(id, before);
  });

  it("STUDENT gọi reject -> 403 (kể cả body sai: quyền kiểm trước), DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await reject(id, users.student, { reason: 123 });

    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("FORBIDDEN");

    await expectUnchanged(id, before);
  });

  it("không có token -> 401, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await reject(id);

    expect(r.status).toBe(401);

    await expectUnchanged(id, before);
  });
});

// ---------------------------------------------------------------------------
// 5. ID không hợp lệ hoặc không tồn tại
// ---------------------------------------------------------------------------

describe("POST /api/v1/exercises/:id/reject - kiểm tra ID", () => {
  it("ID sai định dạng -> 400", async () => {
    for (const badId of ["abc", "0", "-1", "1.5", "99999999999"]) {
      const r = await reject(badId, users.admin);

      expect(r.status, `id=${badId}`).toBe(400);
      expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("ID không tồn tại -> 404", async () => {
    const r = await reject(2147483647, users.admin);

    expect(r.status).toBe(404);
    expect(r.body.error?.code).toBe("NOT_FOUND");
  });
});