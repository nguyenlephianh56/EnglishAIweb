/**
 * Test tích hợp GET /api/v1/exercises/:id: gọi API thật (HTTP) + DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env. Test TỰ TẠO user riêng (email bắt đầu bằng "t2rw_")
 *   và XÓA sạch user + bài tập do test tạo khi chạy xong.
 * - Tiền tố "t2rw_" KHÁC "t2test_" của exercise-api.test.ts, để hai file test chạy song song
 *   không xóa nhầm dữ liệu của nhau.
 * - Cần bật Docker + PostgreSQL trước khi chạy.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t2rw_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const users = {
  admin: 0,
  teacherA: 0,
  teacherB: 0,
  student: 0,
};

// id các bài tập dùng trong test (tạo trực tiếp bằng Prisma để chủ động trạng thái)
const ex = {
  adminLibrary: 0, // ADMIN tạo, PUBLISHED + in_library
  adminDraft: 0, // ADMIN tạo, DRAFT
  adminWriting: 0, // ADMIN tạo, PUBLISHED + in_library, answer = NULL
  aDraft: 0, // GV A tạo, DRAFT
  aLibrary: 0, // GV A tạo, PUBLISHED + in_library
  aHidden: 0, // GV A tạo, HIDDEN
  aProposed: 0, // GV A tạo, PROPOSED
  aPublishedNotInLibrary: 0, // GV A tạo, PUBLISHED nhưng in_library=false
  bDraft: 0, // GV B tạo, DRAFT
  bLibrary: 0, // GV B tạo, PUBLISHED + in_library
};

const EXPLANATION = "Chủ ngữ ngôi thứ ba số ít nên thêm -es.";

let server: Server;
let baseUrl = "";

// 14 field của bản đầy đủ (ADMIN / GV được xem)
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

// 6 field duy nhất HS được nhận (bài thư viện, chưa lộ giải thích)
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

const createExercise = async (
  label: string,
  createdById: number,
  source: "ADMIN" | "TEACHER",
  status: "DRAFT" | "PROPOSED" | "PUBLISHED" | "HIDDEN",
  inLibrary: boolean,
  type: "fill_blank" | "writing" = "fill_blank"
) => {
  const isWriting = type === "writing";
  const row = await prisma.exercise.create({
    data: {
      type,
      skill: isWriting ? "WRITING" : "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} ${label}`,
      content: isWriting
        ? { prompt: "Describe your hometown.", minWords: 80 }
        : { text: "She ___ to school." },
      // writing: lưu NULL của SQL (không phải JSON "null")
      answer: isWriting ? undefined : ["goes"],
      explanation: EXPLANATION,
      status,
      source,
      inLibrary,
      createdById,
    },
    select: { id: true },
  });
  return row.id;
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

  // Dọn rác của lần chạy trước bị dừng giữa chừng (chỉ động vào user có tiền tố t2rw_)
  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((u: { id: number }) => u.id));

  users.admin = await createUser("admin", "ADMIN");
  users.teacherA = await createUser("teacher_a", "TEACHER");
  users.teacherB = await createUser("teacher_b", "TEACHER");
  users.student = await createUser("student", "STUDENT");

  ex.adminLibrary = await createExercise("admin_library", users.admin, "ADMIN", "PUBLISHED", true);
  ex.adminDraft = await createExercise("admin_draft", users.admin, "ADMIN", "DRAFT", false);
  ex.adminWriting = await createExercise(
    "admin_writing",
    users.admin,
    "ADMIN",
    "PUBLISHED",
    true,
    "writing"
  );
  ex.aDraft = await createExercise("a_draft", users.teacherA, "TEACHER", "DRAFT", false);
  ex.aLibrary = await createExercise("a_library", users.teacherA, "TEACHER", "PUBLISHED", true);
  ex.aHidden = await createExercise("a_hidden", users.teacherA, "TEACHER", "HIDDEN", false);
  ex.aProposed = await createExercise("a_proposed", users.teacherA, "TEACHER", "PROPOSED", false);
  ex.aPublishedNotInLibrary = await createExercise(
    "a_published_not_in_library",
    users.teacherA,
    "TEACHER",
    "PUBLISHED",
    false
  );
  ex.bDraft = await createExercise("b_draft", users.teacherB, "TEACHER", "DRAFT", false);
  ex.bLibrary = await createExercise("b_library", users.teacherB, "TEACHER", "PUBLISHED", true);

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
// Hàm tiện ích
// ---------------------------------------------------------------------------
const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

interface ApiResult {
  status: number;
  rawText: string; // JSON thô, để kiểm tra chuỗi trả về thật sự
  body: { data: Record<string, unknown> | null; error: { code: string; message: string } | null };
}

const getExercise = async (id: number | string, userId?: number): Promise<ApiResult> => {
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;

  const res = await fetch(`${baseUrl}/api/v1/exercises/${id}`, { headers });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) };
};

// Tìm key "answer" bất kỳ chỗ nào trong JSON thô (không nhầm với chữ "answer" trong nội dung)
const hasAnswerKey = (rawText: string) => /"answer"\s*:/.test(rawText);

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------
describe("GET /api/v1/exercises/:id - ADMIN", () => {
  it("xem bài thư viện: 200, đủ 14 field, có answer + explanation", async () => {
    const r = await getExercise(ex.adminLibrary, users.admin);
    expect(r.status).toBe(200);
    expect(r.body.error).toBeNull();
    expect(Object.keys(r.body.data ?? {}).sort()).toEqual(FULL_KEYS);
    expect(r.body.data?.id).toBe(ex.adminLibrary);
    expect(r.body.data?.answer).toEqual(["goes"]);
    expect(r.body.data?.explanation).toBe(EXPLANATION);
  });

  it("xem mọi bài: DRAFT, PROPOSED, HIDDEN của GV, bài riêng của GV khác", async () => {
    for (const id of [ex.adminDraft, ex.aDraft, ex.aHidden, ex.aProposed, ex.bDraft, ex.aPublishedNotInLibrary]) {
      const r = await getExercise(id, users.admin);
      expect(r.status, `bài id=${id}`).toBe(200);
      expect(r.body.data?.id).toBe(id);
      expect(r.body.data?.answer).toEqual(["goes"]);
    }
  });

  it("bài writing: answer là null", async () => {
    const r = await getExercise(ex.adminWriting, users.admin);
    expect(r.status).toBe(200);
    expect(r.body.data?.answer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TEACHER
// ---------------------------------------------------------------------------
describe("GET /api/v1/exercises/:id - TEACHER", () => {
  it("bài do mình tạo: thấy đủ field + answer, mọi trạng thái (DRAFT, PROPOSED, HIDDEN, thư viện)", async () => {
    for (const id of [ex.aDraft, ex.aProposed, ex.aHidden, ex.aLibrary, ex.aPublishedNotInLibrary]) {
      const r = await getExercise(id, users.teacherA);
      expect(r.status, `bài id=${id}`).toBe(200);
      expect(Object.keys(r.body.data ?? {}).sort()).toEqual(FULL_KEYS);
      expect(r.body.data?.answer).toEqual(["goes"]);
      expect(r.body.data?.explanation).toBe(EXPLANATION);
    }
  });

  it("bài thư viện của người khác (GV B, admin): xem thử được, đủ field", async () => {
    for (const id of [ex.bLibrary, ex.adminLibrary]) {
      const r = await getExercise(id, users.teacherA);
      expect(r.status, `bài id=${id}`).toBe(200);
      expect(Object.keys(r.body.data ?? {}).sort()).toEqual(FULL_KEYS);
      expect(r.body.data?.answer).toEqual(["goes"]);
    }
  });

  it("bài riêng (không phải thư viện) của người khác -> 404", async () => {
    for (const id of [ex.bDraft, ex.adminDraft]) {
      const r = await getExercise(id, users.teacherA);
      expect(r.status, `bài id=${id}`).toBe(404);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("NOT_FOUND");
    }
  });

  it("GV B không thấy bài DRAFT/HIDDEN/PROPOSED của GV A -> 404", async () => {
    for (const id of [ex.aDraft, ex.aHidden, ex.aProposed, ex.aPublishedNotInLibrary]) {
      const r = await getExercise(id, users.teacherB);
      expect(r.status, `bài id=${id}`).toBe(404);
    }
  });

  it("404 vì không có quyền giống hệt 404 vì không tồn tại (không lộ bài có tồn tại)", async () => {
    const noPermission = await getExercise(ex.bDraft, users.teacherA);
    const notExist = await getExercise(2147483647, users.teacherA);
    expect(noPermission.status).toBe(404);
    expect(notExist.status).toBe(404);
    expect(noPermission.body).toEqual(notExist.body);
  });
});

// ---------------------------------------------------------------------------
// STUDENT
// ---------------------------------------------------------------------------
describe("GET /api/v1/exercises/:id - STUDENT", () => {
  it("bài thư viện: 200, đúng 6 field, KHÔNG có answer, KHÔNG có explanation", async () => {
    for (const id of [ex.adminLibrary, ex.aLibrary, ex.bLibrary]) {
      const r = await getExercise(id, users.student);
      expect(r.status, `bài id=${id}`).toBe(200);
      expect(Object.keys(r.body.data ?? {}).sort()).toEqual(STUDENT_KEYS);
      expect(r.body.data?.content).toEqual({ text: "She ___ to school." });
    }
  });

  it("JSON thô trả về không chứa key answer, không lộ đáp án và giải thích", async () => {
    const r = await getExercise(ex.adminLibrary, users.student);
    expect(r.status).toBe(200);
    expect(hasAnswerKey(r.rawText)).toBe(false);
    expect(r.rawText).not.toContain("goes");
    expect(r.rawText).not.toContain(EXPLANATION);
    // Không lộ field nội bộ
    for (const key of ["status", "source", "inLibrary", "createdById", "createdAt", "updatedAt", "explanation"]) {
      expect(r.rawText, `field ${key}`).not.toContain(`"${key}"`);
    }
  });

  it("bài writing thư viện: không có key answer", async () => {
    const r = await getExercise(ex.adminWriting, users.student);
    expect(r.status).toBe(200);
    expect(hasAnswerKey(r.rawText)).toBe(false);
  });

  it("bài DRAFT / HIDDEN / PROPOSED / PUBLISHED-nhưng-chưa-vào-thư-viện -> 404", async () => {
    for (const id of [ex.adminDraft, ex.aDraft, ex.aHidden, ex.aProposed, ex.aPublishedNotInLibrary]) {
      const r = await getExercise(id, users.student);
      expect(r.status, `bài id=${id}`).toBe(404);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("NOT_FOUND");
      // 404 cũng không được lộ đáp án
      expect(hasAnswerKey(r.rawText)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Bài HIDDEN (chỉ chủ bài / admin)
// ---------------------------------------------------------------------------
describe("GET /api/v1/exercises/:id - bài HIDDEN", () => {
  it("chủ bài và admin thấy; GV khác và HS không thấy", async () => {
    expect((await getExercise(ex.aHidden, users.teacherA)).status).toBe(200);
    expect((await getExercise(ex.aHidden, users.admin)).status).toBe(200);
    expect((await getExercise(ex.aHidden, users.teacherB)).status).toBe(404);
    expect((await getExercise(ex.aHidden, users.student)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// id sai / không tồn tại / chưa đăng nhập
// ---------------------------------------------------------------------------
describe("GET /api/v1/exercises/:id - id và đăng nhập", () => {
  it("id sai định dạng -> 400 VALIDATION_ERROR", async () => {
    for (const badId of ["abc", "0", "-1", "1.5", "1e3", "99999999999", "%20", "12abc"]) {
      const r = await getExercise(badId, users.admin);
      expect(r.status, `id="${badId}"`).toBe(400);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("VALIDATION_ERROR");
      expect(r.body.error?.message).toContain("id:");
    }
  });

  it("id hợp lệ nhưng không tồn tại -> 404 (mọi vai trò)", async () => {
    for (const userId of [users.admin, users.teacherA, users.student]) {
      const r = await getExercise(2147483647, userId);
      expect(r.status).toBe(404);
      expect(r.body.error?.code).toBe("NOT_FOUND");
    }
  });

  it("không có token -> 401", async () => {
    const r = await getExercise(ex.adminLibrary);
    expect(r.status).toBe(401);
    expect(r.body.data).toBeNull();
    expect(hasAnswerKey(r.rawText)).toBe(false);
  });

  it("token sai -> 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/exercises/${ex.adminLibrary}`, {
      headers: { Authorization: "Bearer khong-phai-token" },
    });
    expect(res.status).toBe(401);
  });
});