/**
 * Test tích hợp PATCH /api/v1/exercises/:id: gọi API thật (HTTP) + DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env. Test TỰ TẠO user riêng (email bắt đầu bằng "t2pa_")
 *   và XÓA sạch attempts + bài tập + user do test tạo khi chạy xong.
 * - Tiền tố "t2pa_" KHÁC "t2test_" và "t2rw_" của hai file test kia, để các file test
 *   chạy song song không xóa nhầm dữ liệu của nhau.
 * - Cần bật Docker + PostgreSQL trước khi chạy.
 *
 * Mỗi test tự tạo bài riêng (không dùng chung) nên các test không ảnh hưởng nhau.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t2pa_";
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

const ORIGINAL_CONTENT = { text: "She ___ to school." };
const ORIGINAL_ANSWER = ["goes"];
const ORIGINAL_EXPLANATION = "Chủ ngữ ngôi thứ ba số ít nên thêm -es.";

type Status = "DRAFT" | "PROPOSED" | "PUBLISHED" | "HIDDEN";

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

interface NewExerciseOptions {
  owner?: number;
  status?: Status;
  inLibrary?: boolean;
  type?: "fill_blank" | "writing";
}

// Tạo bài trực tiếp bằng Prisma để chủ động trạng thái. Mặc định: bài fill_blank DRAFT của GV A.
const newExercise = async (options: NewExerciseOptions = {}) => {
  const owner = options.owner ?? users.teacherA;
  const isWriting = options.type === "writing";
  const isAdminOwner = owner === users.admin;

  const row = await prisma.exercise.create({
    data: {
      type: isWriting ? "writing" : "fill_blank",
      skill: isWriting ? "WRITING" : "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} topic gốc`,
      content: isWriting
        ? { prompt: "Describe your hometown.", minWords: 80 }
        : ORIGINAL_CONTENT,
      // writing: để trống -> NULL của SQL
      answer: isWriting ? undefined : ORIGINAL_ANSWER,
      explanation: ORIGINAL_EXPLANATION,
      status: options.status ?? "DRAFT",
      source: isAdminOwner ? "ADMIN" : "TEACHER",
      inLibrary: options.inLibrary ?? false,
      createdById: owner,
    },
    select: { id: true },
  });
  return row.id;
};

// Cho bài có "người làm": tạo 1 dòng attempts của HS
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
  if (!row) throw new Error(`Không thấy bài id=${id} trong DB`);
  return row;
};

const isAnswerSqlNull = async (id: number): Promise<boolean> => {
  const rows = await prisma.$queryRaw<{ is_null: boolean }[]>`
    SELECT answer IS NULL AS is_null FROM exercises WHERE id = ${id}
  `;
  return rows[0].is_null;
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  // attempts phải xóa trước vì tham chiếu tới exercises và users
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
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

  // Dọn rác của lần chạy trước bị dừng giữa chừng (chỉ động vào user có tiền tố t2pa_)
  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((u: { id: number }) => u.id));

  users.admin = await createUser("admin", "ADMIN");
  users.teacherA = await createUser("teacher_a", "TEACHER");
  users.teacherB = await createUser("teacher_b", "TEACHER");
  users.student = await createUser("student", "STUDENT");

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanup(Object.values(users).filter((id) => id > 0));
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Hàm tiện ích gọi API
// ---------------------------------------------------------------------------
const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

interface ApiResult {
  status: number;
  rawText: string;
  body: { data: Record<string, unknown> | null; error: { code: string; message: string } | null };
}

const patch = async (
  id: number | string,
  body: unknown,
  userId?: number
): Promise<ApiResult> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;

  const res = await fetch(`${baseUrl}/api/v1/exercises/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Kiểm tra bài KHÔNG bị thay đổi gì sau một request bị từ chối
const expectUnchanged = async (id: number, before: Awaited<ReturnType<typeof readRow>>) => {
  const after = await readRow(id);
  expect(after).toEqual(before);
};

// ---------------------------------------------------------------------------
// Sửa thành công
// ---------------------------------------------------------------------------
describe("PATCH /api/v1/exercises/:id - chủ bài / admin sửa thành công", () => {
  it("GV chủ bài (DRAFT) sửa đủ 6 field: 200, response đủ 14 field, DB khớp, updated_at đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);
    await sleep(30); // để updated_at chắc chắn khác (độ phân giải mili giây)

    const r = await patch(
      id,
      {
        topic: "  Chủ đề mới  ",
        skill: "READING",
        level: "B1",
        content: { text: "He ___ to work and ___ home." },
        answer: ["goes", "comes"],
        explanation: "  Giải thích mới  ",
      },
      users.teacherA
    );

    expect(r.status).toBe(200);
    expect(r.body.error).toBeNull();
    expect(Object.keys(r.body.data ?? {}).sort()).toEqual(FULL_KEYS);
    expect(r.body.data?.topic).toBe("Chủ đề mới");
    expect(r.body.data?.skill).toBe("READING");
    expect(r.body.data?.level).toBe("B1");
    expect(r.body.data?.content).toEqual({ text: "He ___ to work and ___ home." });
    expect(r.body.data?.answer).toEqual(["goes", "comes"]);
    expect(r.body.data?.explanation).toBe("Giải thích mới");

    const after = await readRow(id);
    expect(after.topic).toBe("Chủ đề mới");
    expect(after.skill).toBe("READING");
    expect(after.level).toBe("B1");
    expect(after.content).toEqual({ text: "He ___ to work and ___ home." });
    expect(after.answer).toEqual(["goes", "comes"]);
    expect(after.explanation).toBe("Giải thích mới");

    // updated_at đổi, created_at và các field hệ thống giữ nguyên
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.type).toBe("fill_blank");
    expect(after.status).toBe("DRAFT");
    expect(after.source).toBe("TEACHER");
    expect(after.inLibrary).toBe(false);
    expect(after.createdById).toBe(users.teacherA);
  });

  it("ADMIN sửa được bài DRAFT của GV", async () => {
    const id = await newExercise();
    const r = await patch(id, { topic: "Admin sửa" }, users.admin);
    expect(r.status).toBe(200);
    expect((await readRow(id)).topic).toBe("Admin sửa");
    // người tạo vẫn là GV A, không đổi thành admin
    expect((await readRow(id)).createdById).toBe(users.teacherA);
  });

  it("chỉ gửi topic: các field còn lại giữ nguyên", async () => {
    const id = await newExercise();
    const r = await patch(id, { topic: "Chỉ đổi chủ đề" }, users.teacherA);
    expect(r.status).toBe(200);

    const after = await readRow(id);
    expect(after.topic).toBe("Chỉ đổi chủ đề");
    expect(after.content).toEqual(ORIGINAL_CONTENT);
    expect(after.answer).toEqual(ORIGINAL_ANSWER);
    expect(after.explanation).toBe(ORIGINAL_EXPLANATION);
    expect(after.skill).toBe("FOUNDATION");
    expect(after.level).toBe("A1");
  });

  it("chỉ gửi content (cùng số chỗ trống): answer cũ giữ nguyên", async () => {
    const id = await newExercise();
    const r = await patch(id, { content: { text: "My sister ___ to school." } }, users.teacherA);
    expect(r.status).toBe(200);

    const after = await readRow(id);
    expect(after.content).toEqual({ text: "My sister ___ to school." });
    expect(after.answer).toEqual(ORIGINAL_ANSWER);
  });

  it("explanation: null hoặc chuỗi rỗng -> xóa; không gửi -> giữ nguyên", async () => {
    const id = await newExercise();

    expect((await patch(id, { topic: "x1" }, users.teacherA)).status).toBe(200);
    expect((await readRow(id)).explanation).toBe(ORIGINAL_EXPLANATION);

    expect((await patch(id, { explanation: null }, users.teacherA)).status).toBe(200);
    expect((await readRow(id)).explanation).toBeNull();

    expect((await patch(id, { explanation: "Có lại" }, users.teacherA)).status).toBe(200);
    expect((await readRow(id)).explanation).toBe("Có lại");

    expect((await patch(id, { explanation: "   " }, users.teacherA)).status).toBe(200);
    expect((await readRow(id)).explanation).toBeNull();
  });

  it("bài writing: sửa content, answer vẫn là NULL thật của SQL; gửi answer=null cũng NULL thật", async () => {
    const id = await newExercise({ type: "writing" });
    expect(await isAnswerSqlNull(id)).toBe(true);

    const r1 = await patch(
      id,
      { content: { prompt: "Describe your family.", minWords: 100 } },
      users.teacherA
    );
    expect(r1.status).toBe(200);
    expect(r1.body.data?.answer).toBeNull();
    expect((await readRow(id)).content).toEqual({ prompt: "Describe your family.", minWords: 100 });
    expect(await isAnswerSqlNull(id)).toBe(true);

    const r2 = await patch(id, { answer: null }, users.teacherA);
    expect(r2.status).toBe(200);
    expect(await isAnswerSqlNull(id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quyền
// ---------------------------------------------------------------------------
describe("PATCH /api/v1/exercises/:id - quyền truy cập", () => {
  it("GV khác sửa bài của người khác -> 404, DB không đổi (cả bài DRAFT lẫn bài thư viện xem được)", async () => {
    const draft = await newExercise();
    const libraryOfA = await newExercise({ status: "PUBLISHED", inLibrary: true });
    const libraryOfAdmin = await newExercise({
      owner: users.admin,
      status: "PUBLISHED",
      inLibrary: true,
    });

    for (const id of [draft, libraryOfA, libraryOfAdmin]) {
      const before = await readRow(id);
      const r = await patch(id, { topic: "GV B phá" }, users.teacherB);
      expect(r.status, `bài id=${id}`).toBe(404);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("NOT_FOUND");
      await expectUnchanged(id, before);
    }
  });

  it("GV sửa bài do ADMIN tạo (dù là GV nào) -> 404", async () => {
    const id = await newExercise({ owner: users.admin });
    const before = await readRow(id);
    const r = await patch(id, { topic: "GV sửa bài admin" }, users.teacherA);
    expect(r.status).toBe(404);
    await expectUnchanged(id, before);
  });

  it("HS -> 403, DB không đổi, kể cả bài thư viện HS vẫn xem được", async () => {
    const library = await newExercise({ status: "PUBLISHED", inLibrary: true });
    const draft = await newExercise();

    for (const id of [library, draft]) {
      const before = await readRow(id);
      const r = await patch(id, { topic: "HS phá" }, users.student);
      expect(r.status, `bài id=${id}`).toBe(403);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("FORBIDDEN");
      await expectUnchanged(id, before);
    }
  });

  it("HS gửi PATCH tới id không tồn tại vẫn 403 (chặn theo vai trò trước)", async () => {
    const r = await patch(2147483647, { topic: "x" }, users.student);
    expect(r.status).toBe(403);
  });

  it("không có token -> 401; token sai -> 401; DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    expect((await patch(id, { topic: "x" })).status).toBe(401);

    const res = await fetch(`${baseUrl}/api/v1/exercises/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer khong-phai-token" },
      body: JSON.stringify({ topic: "x" }),
    });
    expect(res.status).toBe(401);

    await expectUnchanged(id, before);
  });
});

// ---------------------------------------------------------------------------
// (b) GV sửa bài đã công bố / đang chờ duyệt
// ---------------------------------------------------------------------------
describe("PATCH /api/v1/exercises/:id - (b) chỉ ADMIN sửa bài PUBLISHED/PROPOSED", () => {
  it("GV chủ bài sửa bài PUBLISHED (trong thư viện) -> 403, DB không đổi", async () => {
    const id = await newExercise({ status: "PUBLISHED", inLibrary: true });
    const before = await readRow(id);
    const r = await patch(id, { topic: "GV sửa bài đã công bố" }, users.teacherA);
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe("FORBIDDEN");
    expect(r.body.error?.message).toContain("quản trị viên");
    await expectUnchanged(id, before);
  });

  it("GV chủ bài sửa bài PUBLISHED nhưng chưa vào thư viện -> vẫn 403", async () => {
    const id = await newExercise({ status: "PUBLISHED", inLibrary: false });
    const r = await patch(id, { topic: "x" }, users.teacherA);
    expect(r.status).toBe(403);
  });

  it("GV chủ bài sửa bài PROPOSED (đang chờ duyệt) -> 403, DB không đổi", async () => {
    const id = await newExercise({ status: "PROPOSED" });
    const before = await readRow(id);
    const r = await patch(id, { topic: "x" }, users.teacherA);
    expect(r.status).toBe(403);
    await expectUnchanged(id, before);
  });

  it("GV chủ bài sửa được bài DRAFT và HIDDEN", async () => {
    const draft = await newExercise({ status: "DRAFT" });
    const hidden = await newExercise({ status: "HIDDEN" });
    expect((await patch(draft, { topic: "sửa draft" }, users.teacherA)).status).toBe(200);
    expect((await patch(hidden, { topic: "sửa hidden" }, users.teacherA)).status).toBe(200);
  });

  it("ADMIN sửa được bài PUBLISHED và PROPOSED; trạng thái giữ nguyên", async () => {
    const published = await newExercise({ status: "PUBLISHED", inLibrary: true });
    const proposed = await newExercise({ status: "PROPOSED" });

    expect((await patch(published, { topic: "admin sửa published" }, users.admin)).status).toBe(200);
    expect((await patch(proposed, { topic: "admin sửa proposed" }, users.admin)).status).toBe(200);

    const p = await readRow(published);
    expect(p.status).toBe("PUBLISHED");
    expect(p.inLibrary).toBe(true);
    expect((await readRow(proposed)).status).toBe("PROPOSED");
  });
});

// ---------------------------------------------------------------------------
// 400: dữ liệu sai
// ---------------------------------------------------------------------------
describe("PATCH /api/v1/exercises/:id - 400 dữ liệu sai (DB không đổi)", () => {
  it("chỉ gửi answer làm lệch số chỗ trống -> 400 kèm field answer", async () => {
    const id = await newExercise();
    const before = await readRow(id);
    const r = await patch(id, { answer: ["goes", "extra"] }, users.teacherA);
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    expect(r.body.error?.message).toContain("answer");
    await expectUnchanged(id, before);
  });

  it("chỉ gửi content làm lệch số chỗ trống so với answer cũ -> 400", async () => {
    const id = await newExercise();
    const before = await readRow(id);
    const r = await patch(id, { content: { text: "He ___ to work and ___ home." } }, users.teacherA);
    expect(r.status).toBe(400);
    expect(r.body.error?.message).toContain("answer");
    await expectUnchanged(id, before);
  });

  it("content sai cấu trúc -> 400 kèm đường dẫn content", async () => {
    const id = await newExercise();
    const before = await readRow(id);
    const r = await patch(id, { content: { sai: true } }, users.teacherA);
    expect(r.status).toBe(400);
    expect(r.body.error?.message).toContain("content");
    await expectUnchanged(id, before);
  });

  it("content = null hoặc chuỗi -> 400", async () => {
    const id = await newExercise();
    expect((await patch(id, { content: null }, users.teacherA)).status).toBe(400);
    expect((await patch(id, { content: "abc" }, users.teacherA)).status).toBe(400);
  });

  it("answer = null cho bài bắt buộc có đáp án -> 400", async () => {
    const id = await newExercise();
    const before = await readRow(id);
    const r = await patch(id, { answer: null }, users.teacherA);
    expect(r.status).toBe(400);
    expect(r.body.error?.message).toContain("answer");
    await expectUnchanged(id, before);
  });

  it("bài writing gửi answer có giá trị -> 400", async () => {
    const id = await newExercise({ type: "writing" });
    const r = await patch(id, { answer: ["không được có"] }, users.teacherA);
    expect(r.status).toBe(400);
    expect(r.body.error?.message).toContain("answer");
    expect(await isAnswerSqlNull(id)).toBe(true);
  });

  it("bài writing đổi skill sang READING -> 400 (skill theo type, như POST)", async () => {
    const id = await newExercise({ type: "writing" });
    const before = await readRow(id);
    const r = await patch(id, { skill: "READING" }, users.teacherA);
    expect(r.status).toBe(400);
    expect(r.body.error?.message).toContain("skill");
    expect(r.body.error?.message).toContain("WRITING");
    await expectUnchanged(id, before);
  });

  it("bài fill_blank được đổi skill sang READING (dạng này không bị ràng buộc)", async () => {
    const id = await newExercise();
    const r = await patch(id, { skill: "READING" }, users.teacherA);
    expect(r.status).toBe(200);
  });

  it("topic rỗng / quá dài / sai kiểu -> 400 kèm 'topic:'", async () => {
    const id = await newExercise();
    for (const topic of ["", "   ", "a".repeat(201), 123]) {
      const r = await patch(id, { topic }, users.teacherA);
      expect(r.status, `topic=${JSON.stringify(topic).slice(0, 20)}`).toBe(400);
      expect(r.body.error?.message).toContain("topic:");
    }
  });

  it("skill / level không hợp lệ -> 400", async () => {
    const id = await newExercise();
    const s = await patch(id, { skill: "MATH" }, users.teacherA);
    expect(s.status).toBe(400);
    expect(s.body.error?.message).toContain("skill:");

    const l = await patch(id, { level: "C1" }, users.teacherA);
    expect(l.status).toBe(400);
    expect(l.body.error?.message).toContain("level:");
  });

  it("explanation quá dài hoặc sai kiểu -> 400", async () => {
    const id = await newExercise();
    expect((await patch(id, { explanation: "a".repeat(5001) }, users.teacherA)).status).toBe(400);
    expect((await patch(id, { explanation: 42 }, users.teacherA)).status).toBe(400);
  });

  it("body rỗng {} hoặc mảng [] -> 400", async () => {
    const id = await newExercise();
    const empty = await patch(id, {}, users.teacherA);
    expect(empty.status).toBe(400);
    expect(empty.body.error?.message).toContain("ít nhất một trường");

    expect((await patch(id, [], users.teacherA)).status).toBe(400);
  });

  it("id sai định dạng -> 400; id không tồn tại -> 404", async () => {
    for (const badId of ["abc", "0", "-1", "1.5", "99999999999"]) {
      const r = await patch(badId, { topic: "x" }, users.admin);
      expect(r.status, `id="${badId}"`).toBe(400);
      expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    }
    expect((await patch(2147483647, { topic: "x" }, users.admin)).status).toBe(404);
    expect((await patch(2147483647, { topic: "x" }, users.teacherA)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Field cấm
// ---------------------------------------------------------------------------
describe("PATCH /api/v1/exercises/:id - field cấm bị bỏ qua", () => {
  const forbidden = {
    type: "writing",
    status: "PUBLISHED",
    inLibrary: true,
    in_library: true,
    source: "AI",
    createdById: 999999,
    created_by_id: 999999,
    id: 999999,
    createdAt: "2000-01-01T00:00:00.000Z",
    publish: true,
  };

  it("GV: field cấm đi kèm field hợp lệ -> 200, chỉ field hợp lệ được áp dụng", async () => {
    const id = await newExercise();
    const before = await readRow(id);

    const r = await patch(id, { ...forbidden, topic: "Chỉ cái này được áp dụng" }, users.teacherA);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.data ?? {}).sort()).toEqual(FULL_KEYS);

    const after = await readRow(id);
    expect(after.topic).toBe("Chỉ cái này được áp dụng");
    expect(after.id).toBe(id);
    expect(after.type).toBe("fill_blank");
    expect(after.status).toBe("DRAFT");
    expect(after.source).toBe("TEACHER");
    expect(after.inLibrary).toBe(false);
    expect(after.createdById).toBe(users.teacherA);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.content).toEqual(ORIGINAL_CONTENT);
  });

  it("ADMIN cũng không đổi được type/status/in_library/source qua PATCH", async () => {
    const id = await newExercise();
    const r = await patch(id, { ...forbidden, topic: "Admin thử đổi trạng thái" }, users.admin);
    expect(r.status).toBe(200);

    const after = await readRow(id);
    expect(after.type).toBe("fill_blank");
    expect(after.status).toBe("DRAFT");
    expect(after.source).toBe("TEACHER");
    expect(after.inLibrary).toBe(false);
    expect(after.createdById).toBe(users.teacherA);
  });

  it("chỉ gửi field cấm (không có field hợp lệ nào) -> 400, DB không đổi", async () => {
    const id = await newExercise();
    const before = await readRow(id);
    const r = await patch(id, forbidden, users.teacherA);
    expect(r.status).toBe(400);
    expect(r.body.error?.message).toContain("ít nhất một trường");
    await expectUnchanged(id, before);
  });
});

// ---------------------------------------------------------------------------
// (a) Bài đã có người làm
// ---------------------------------------------------------------------------
describe("PATCH /api/v1/exercises/:id - (a) bài đã có attempts", () => {
  it("đổi content / answer / skill / level -> 409 CONFLICT, DB không đổi", async () => {
    const id = await newExercise();
    await addAttempt(id);
    const before = await readRow(id);

    const attempts: Record<string, unknown>[] = [
      { content: { text: "He ___ to school." } }, // đổi content, vẫn 1 chỗ trống
      { answer: ["went"] },
      { skill: "READING" },
      { level: "B2" },
      { content: { text: "He ___ to school." }, answer: ["went"] },
    ];

    for (const body of attempts) {
      const r = await patch(id, body, users.teacherA);
      expect(r.status, JSON.stringify(body)).toBe(409);
      expect(r.body.error?.code).toBe("CONFLICT");
      expect(r.body.data).toBeNull();
      await expectUnchanged(id, before);
    }
  });

  it("vẫn sửa được topic và explanation -> 200", async () => {
    const id = await newExercise();
    await addAttempt(id);

    const r = await patch(
      id,
      { topic: "Chủ đề sau khi có người làm", explanation: "Giải thích mới" },
      users.teacherA
    );
    expect(r.status).toBe(200);

    const after = await readRow(id);
    expect(after.topic).toBe("Chủ đề sau khi có người làm");
    expect(after.explanation).toBe("Giải thích mới");
    expect(after.content).toEqual(ORIGINAL_CONTENT);
    expect(after.answer).toEqual(ORIGINAL_ANSWER);
  });

  it("gửi lại content/answer/skill/level GIỐNG HỆT cũ (FE gửi cả form) -> không bị chặn", async () => {
    const id = await newExercise();
    await addAttempt(id);

    const r = await patch(
      id,
      {
        topic: "Đổi chủ đề, giữ nguyên phần còn lại",
        skill: "FOUNDATION",
        level: "A1",
        content: { text: "  She ___ to school.  " }, // chỉ khác khoảng trắng, T1 sẽ trim
        answer: ["goes"],
      },
      users.teacherA
    );
    expect(r.status).toBe(200);
    expect((await readRow(id)).topic).toBe("Đổi chủ đề, giữ nguyên phần còn lại");
  });

  it("ADMIN cũng bị chặn đổi content (409) nhưng sửa topic thì được", async () => {
    const id = await newExercise({ status: "PUBLISHED", inLibrary: true });
    await addAttempt(id);

    const blocked = await patch(id, { content: { text: "He ___ to school." } }, users.admin);
    expect(blocked.status).toBe(409);

    const ok = await patch(id, { topic: "Admin sửa topic" }, users.admin);
    expect(ok.status).toBe(200);
  });

  it("dữ liệu sai vẫn báo 400 (kiểm hợp lệ chạy trước kiểm attempts)", async () => {
    const id = await newExercise();
    await addAttempt(id);
    const r = await patch(id, { answer: ["a", "b", "c"] }, users.teacherA);
    expect(r.status).toBe(400);
  });

  it("bài CHƯA có attempts vẫn đổi được content/answer/skill/level", async () => {
    const id = await newExercise();
    const r = await patch(
      id,
      { content: { text: "He ___ to school." }, answer: ["went"], skill: "READING", level: "B2" },
      users.teacherA
    );
    expect(r.status).toBe(200);
  });
});