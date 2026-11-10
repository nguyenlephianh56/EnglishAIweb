/**
 * Test tích hợp POST /api/v1/exercises: gọi API thật (HTTP) + DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env. Test TỰ TẠO user riêng (email bắt đầu bằng "t2test_")
 *   và XÓA sạch user + bài tập do test tạo khi chạy xong.
 * - Muốn tách khỏi DB dev: trỏ DATABASE_URL sang một database test riêng rồi chạy lại.
 * - Không dùng supertest: dùng fetch có sẵn của Node.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t2test_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const ids = {
  admin: 0,
  teacher: 0,
  teacherPending: 0,
  teacherLocked: 0,
  student: 0,
};

let server: Server;
let baseUrl = "";

// 14 field duy nhất được phép xuất hiện trong response
const RESPONSE_KEYS = [
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
  role: "ADMIN" | "TEACHER" | "STUDENT",
  status: "ACTIVE" | "PENDING" | "LOCKED"
) => {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`,
      email: `${RUN_ID}_${label}@test.local`,
      passwordHash: "not-a-real-hash",
      role,
      status,
    },
    select: { id: true },
  });
  return user.id;
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "Không kết nối được database. Kiểm tra DATABASE_URL trong server/.env và PostgreSQL đang chạy."
    );
  }

  // Dọn rác của lần chạy trước bị dừng giữa chừng (chỉ động vào user có tiền tố t2test_)
  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((u: { id: number }) => u.id));

  ids.admin = await createUser("admin", "ADMIN", "ACTIVE");
  ids.teacher = await createUser("teacher", "TEACHER", "ACTIVE");
  ids.teacherPending = await createUser("teacher_pending", "TEACHER", "PENDING");
  ids.teacherLocked = await createUser("teacher_locked", "TEACHER", "LOCKED");
  ids.student = await createUser("student", "STUDENT", "ACTIVE");

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanup(Object.values(ids).filter((id) => id > 0));
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Hàm tiện ích
// ---------------------------------------------------------------------------
const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

const validBody = (override: Record<string, unknown> = {}) => ({
  type: "fill_blank",
  skill: "FOUNDATION",
  level: "A1",
  topic: "Present simple",
  content: { text: "She ___ to school." },
  answer: ["goes"],
  ...override,
});

const writingBody = (override: Record<string, unknown> = {}) => ({
  type: "writing",
  skill: "WRITING",
  level: "B1",
  topic: "My hometown",
  content: { prompt: "Describe your hometown.", minWords: 80 },
  ...override,
});

const post = async (body: unknown, auth?: string) => {
  const res = await fetch(`${baseUrl}/api/v1/exercises`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  return { status: res.status, json };
};

const asUser = (userId: number) => `Bearer ${tokenOf(userId)}`;

const countOf = (userIds: number[]) =>
  prisma.exercise.count({ where: { createdById: { in: userIds } } });

/** Đọc cột answer ở mức SQL để phân biệt NULL thật với JSON "null". */
const answerStorage = async (exerciseId: number) => {
  const rows = await prisma.$queryRaw<{ is_null: boolean; json_type: string | null }[]>`
    SELECT answer IS NULL AS is_null, jsonb_typeof(answer) AS json_type
    FROM exercises WHERE id = ${exerciseId}`;
  return rows[0];
};

// ---------------------------------------------------------------------------
// 201 - TEACHER
// ---------------------------------------------------------------------------
describe("POST /api/v1/exercises - TEACHER tạo hợp lệ", () => {
  it("dạng chấm tự động -> 201, DRAFT, in_library=false, đúng created_by_id; DB khớp", async () => {
    const { status, json } = await post(
      validBody({ topic: "  Present simple  ", explanation: "  Ngôi thứ 3 thêm es  " }),
      asUser(ids.teacher)
    );

    expect(status).toBe(201);
    expect(json.error).toBeNull();
    expect(json.data).toMatchObject({
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: "Present simple",
      content: { text: "She ___ to school." },
      answer: ["goes"],
      explanation: "Ngôi thứ 3 thêm es",
      status: "DRAFT",
      source: "TEACHER",
      inLibrary: false,
      createdById: ids.teacher,
    });

    const row = await prisma.exercise.findUnique({ where: { id: json.data.id } });
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: "Present simple",
      content: { text: "She ___ to school." },
      answer: ["goes"],
      explanation: "Ngôi thứ 3 thêm es",
      status: "DRAFT",
      source: "TEACHER",
      inLibrary: false,
      createdById: ids.teacher,
    });
    expect(row!.createdAt).toBeInstanceOf(Date);
    expect(row!.updatedAt).toBeInstanceOf(Date);
  });

  it("writing không có answer -> 201, answer = NULL thật trong DB, explanation null", async () => {
    const { status, json } = await post(writingBody(), asUser(ids.teacher));

    expect(status).toBe(201);
    expect(json.data.answer).toBeNull();
    expect(json.data.explanation).toBeNull();
    expect(json.data).toMatchObject({
      type: "writing",
      skill: "WRITING",
      status: "DRAFT",
      source: "TEACHER",
      inLibrary: false,
      createdById: ids.teacher,
    });

    const storage = await answerStorage(json.data.id);
    expect(storage.is_null).toBe(true); // SQL NULL
    expect(storage.json_type).toBeNull(); // không phải JSON "null"
  });

  it("response có đúng 14 field, không thừa", async () => {
    const { json } = await post(validBody(), asUser(ids.teacher));
    expect(Object.keys(json.data).sort()).toEqual(RESPONSE_KEYS);
    expect(Object.keys(json).sort()).toEqual(["data", "error"]);
    expect(typeof json.data.createdAt).toBe("string");
    expect(typeof json.data.updatedAt).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 201 - ADMIN
// ---------------------------------------------------------------------------
describe("POST /api/v1/exercises - ADMIN", () => {
  it("không publish -> source=ADMIN, DRAFT, in_library=false", async () => {
    const { status, json } = await post(validBody(), asUser(ids.admin));
    expect(status).toBe(201);
    expect(json.data).toMatchObject({
      source: "ADMIN",
      status: "DRAFT",
      inLibrary: false,
      createdById: ids.admin,
    });
    const row = await prisma.exercise.findUnique({ where: { id: json.data.id } });
    expect(row).toMatchObject({ source: "ADMIN", status: "DRAFT", inLibrary: false });
  });

  it("publish=false vẫn là DRAFT", async () => {
    const { json } = await post(validBody({ publish: false }), asUser(ids.admin));
    expect(json.data).toMatchObject({ status: "DRAFT", inLibrary: false });
  });

  it("publish=true -> PUBLISHED + in_library=true; DB khớp, response không có field publish", async () => {
    const { status, json } = await post(validBody({ publish: true }), asUser(ids.admin));
    expect(status).toBe(201);
    expect(json.data).toMatchObject({
      source: "ADMIN",
      status: "PUBLISHED",
      inLibrary: true,
      createdById: ids.admin,
    });
    expect(json.data).not.toHaveProperty("publish");
    expect(Object.keys(json.data).sort()).toEqual(RESPONSE_KEYS);

    const row = await prisma.exercise.findUnique({ where: { id: json.data.id } });
    expect(row).toMatchObject({
      source: "ADMIN",
      status: "PUBLISHED",
      inLibrary: true,
      createdById: ids.admin,
    });
  });
});

// ---------------------------------------------------------------------------
// TEACHER cố tự đặt các field do server quyết định
// ---------------------------------------------------------------------------
describe("POST /api/v1/exercises - TEACHER gửi field giả", () => {
  it("status/in_library/source/publish/created_by_id bị bỏ qua, bài vẫn là DRAFT", async () => {
    const { status, json } = await post(
      validBody({
        status: "PUBLISHED",
        inLibrary: true,
        in_library: true,
        source: "ADMIN",
        publish: true,
        createdById: ids.admin, // thử mạo danh admin
        created_by_id: ids.admin,
        id: 999999,
      }),
      asUser(ids.teacher)
    );

    expect(status).toBe(201);
    expect(json.data).toMatchObject({
      status: "DRAFT",
      inLibrary: false,
      source: "TEACHER",
      createdById: ids.teacher,
    });
    expect(json.data.id).not.toBe(999999);

    const row = await prisma.exercise.findUnique({ where: { id: json.data.id } });
    expect(row).toMatchObject({
      status: "DRAFT",
      inLibrary: false,
      source: "TEACHER",
      createdById: ids.teacher,
    });
  });
});

// ---------------------------------------------------------------------------
// Quyền: 401 / 403
// ---------------------------------------------------------------------------
describe("POST /api/v1/exercises - quyền truy cập", () => {
  it("không có token -> 401", async () => {
    const { status, json } = await post(validBody());
    expect(status).toBe(401);
    expect(json.data).toBeNull();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("token sai -> 401", async () => {
    const { status, json } = await post(validBody(), "Bearer abc.def.ghi");
    expect(status).toBe(401);
    expect(json.error.code).toBe("INVALID_TOKEN");
  });

  it("token ký bằng secret khác -> 401", async () => {
    const forged = jwt.sign({ userId: ids.teacher }, "a-completely-different-secret-123");
    const { status } = await post(validBody(), `Bearer ${forged}`);
    expect(status).toBe(401);
  });

  it("STUDENT -> 403", async () => {
    const { status, json } = await post(validBody(), asUser(ids.student));
    expect(status).toBe(403);
    expect(json.data).toBeNull();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  // Lưu ý: middleware authenticate chặn mọi user không ACTIVE bằng 401 (không phải 403).
  // Đây là hành vi có sẵn của dự án; test ghi nhận đúng hành vi đó.
  it("TEACHER PENDING -> bị chặn (401 từ authenticate)", async () => {
    const { status, json } = await post(validBody(), asUser(ids.teacherPending));
    expect(status).toBe(401);
    expect(json.data).toBeNull();
  });

  it("TEACHER LOCKED -> bị chặn (401 từ authenticate)", async () => {
    const { status, json } = await post(validBody(), asUser(ids.teacherLocked));
    expect(status).toBe(401);
    expect(json.data).toBeNull();
  });

  it("các request bị chặn không tạo dòng nào trong DB", async () => {
    const blocked = [ids.student, ids.teacherPending, ids.teacherLocked];
    await post(validBody(), asUser(ids.student));
    await post(validBody(), asUser(ids.teacherPending));
    await post(validBody(), asUser(ids.teacherLocked));
    expect(await countOf(blocked)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 400 - dữ liệu sai
// ---------------------------------------------------------------------------
describe("POST /api/v1/exercises - 400 dữ liệu sai", () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ["type lạ", validBody({ type: "essay" }), /^type: /],
    ["thiếu type", validBody({ type: undefined }), /^type: /],
    ["thiếu content", validBody({ content: undefined }), /content/],
    ["answer lệch độ dài so với content", validBody({ answer: ["goes", "extra"] }), /answer/],
    ["thiếu answer ở dạng bắt buộc có answer", validBody({ answer: undefined }), /answer/],
    ["writing có answer", writingBody({ answer: ["bài mẫu"] }), /answer/],
    ["topic rỗng", validBody({ topic: "" }), /^topic: .*không được để trống/],
    ["topic toàn khoảng trắng", validBody({ topic: "     " }), /^topic: .*không được để trống/],
    ["topic quá dài", validBody({ topic: "a".repeat(201) }), /^topic: .*không được vượt quá/],
    ["skill ngoài enum", validBody({ skill: "COOKING" }), /^skill: /],
    ["level ngoài enum", validBody({ level: "C2" }), /^level: /],
    ["writing nhưng skill không phải WRITING", writingBody({ skill: "FOUNDATION" }), /^skill: .*WRITING/],
    [
      "listening_fill nhưng skill không phải LISTENING",
      validBody({ type: "listening_fill", skill: "READING" }),
      /^skill: .*LISTENING/,
    ],
    [
      "speaking nhưng skill không phải SPEAKING",
      validBody({ type: "speaking", skill: "WRITING" }),
      /^skill: .*SPEAKING/,
    ],
    ["publish sai kiểu", validBody({ publish: "true" }), /^publish: /],
  ];

  it.each(cases)("%s -> 400, không tạo dòng", async (_name, body, messageRegex) => {
    const before = await countOf([ids.teacher, ids.admin]);

    const { status, json } = await post(body, asUser(ids.teacher));

    expect(status).toBe(400);
    expect(json.data).toBeNull();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toMatch(messageRegex);

    expect(await countOf([ids.teacher, ids.admin])).toBe(before);
  });
});