/**
 * Test tích hợp POST /api/v1/assignments (giao bài).
 * Gọi API thật (HTTP) + DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env.
 * - Tự tạo user/lớp/bài riêng, xóa sạch sau khi chạy.
 * - Tiền tố "t5post_" riêng để không xóa nhầm dữ liệu của test khác.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t5post_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const HOUR = 60 * 60 * 1000;

const users = { admin: 0, teacher: 0, teacher2: 0, student: 0 };
const ids = {
  classOwn: 0, // lớp của teacher
  classOther: 0, // lớp của teacher2
  publishedOfOther: 0, // PUBLISHED do teacher2 tạo
  ownDraft: 0, // DRAFT do teacher tạo
  ownHidden: 0, // HIDDEN do teacher tạo
  otherDraft: 0, // DRAFT do teacher2 tạo
  otherHidden: 0, // HIDDEN do teacher2 tạo
  writingPublished: 0, // PUBLISHED, dạng writing (chưa cho giao)
};

let server: Server;
let baseUrl = "";

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

const newFillBlank = async (createdById: number, status: Status) => {
  const row = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} fill_blank ${status}`,
      content: { text: "She ___ to school." },
      answer: ["goes"],
      explanation: "Ngôi thứ ba số ít",
      status,
      source: "TEACHER",
      inLibrary: status === "PUBLISHED",
      createdById,
    },
    select: { id: true },
  });
  return row.id;
};

const newWriting = async (createdById: number, status: Status) => {
  const row = await prisma.exercise.create({
    data: {
      type: "writing",
      skill: "WRITING",
      level: "A2",
      topic: `${RUN_ID} writing`,
      content: { prompt: "Write about your day", minWords: 50 },
      answer: undefined,
      status,
      source: "TEACHER",
      inLibrary: status === "PUBLISHED",
      createdById,
    },
    select: { id: true },
  });
  return row.id;
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  // Lớp bị xóa kéo theo assignments + class_members (cascade); sau đó xóa bài, rồi user.
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
  users.student = await createUser("student", "STUDENT");

  ids.classOwn = await createClass(users.teacher, "class_own");
  ids.classOther = await createClass(users.teacher2, "class_other");

  ids.publishedOfOther = await newFillBlank(users.teacher2, "PUBLISHED");
  ids.ownDraft = await newFillBlank(users.teacher, "DRAFT");
  ids.ownHidden = await newFillBlank(users.teacher, "HIDDEN");
  ids.otherDraft = await newFillBlank(users.teacher2, "DRAFT");
  ids.otherHidden = await newFillBlank(users.teacher2, "HIDDEN");
  ids.writingPublished = await newWriting(users.teacher2, "PUBLISHED");

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

const postAssignment = async (
  body: unknown,
  userId?: number
): Promise<ApiResult> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;

  const res = await fetch(`${baseUrl}/api/v1/assignments`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ApiResult["body"] };
};

const futureIso = (hours = 48) => new Date(Date.now() + hours * HOUR).toISOString();

const validBody = (overrides: Record<string, unknown> = {}) => ({
  exerciseId: ids.publishedOfOther,
  classId: ids.classOwn,
  dueAt: futureIso(),
  ...overrides,
});

describe("POST /api/v1/assignments - tạo thành công", () => {
  it("GV giao bài PUBLISHED (của người khác) cho lớp mình -> 201, đủ field, đúng kiểu", async () => {
    const due = futureIso(72);
    const res = await postAssignment(
      validBody({ dueAt: due, remindBeforeHours: [24, 1] }),
      users.teacher
    );

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    const data = res.body.data!;
    expect(Object.keys(data).sort()).toEqual(
      [
        "assignedById",
        "classId",
        "createdAt",
        "dueAt",
        "exerciseId",
        "id",
        "remindBeforeHours",
      ].sort()
    );
    expect(data.exerciseId).toBe(ids.publishedOfOther);
    expect(data.classId).toBe(ids.classOwn);
    expect(data.assignedById).toBe(users.teacher);
    expect(new Date(data.dueAt as string).toISOString()).toBe(due);
    expect(data.remindBeforeHours).toEqual([24, 1]);

    // Có thật trong DB
    const row = await prisma.assignment.findUnique({
      where: { id: data.id as number },
    });
    expect(row?.assignedById).toBe(users.teacher);
    expect(row?.remindBeforeH).toEqual([24, 1]);
  });

  it("GV giao bài DRAFT do chính mình tạo -> 201", async () => {
    const res = await postAssignment(
      validBody({ exerciseId: ids.ownDraft }),
      users.teacher
    );
    expect(res.status).toBe(201);
    expect(res.body.data?.exerciseId).toBe(ids.ownDraft);
  });

  it("không gửi remindBeforeHours -> 201, mảng rỗng", async () => {
    const res = await postAssignment(validBody(), users.teacher);
    expect(res.status).toBe(201);
    expect(res.body.data?.remindBeforeHours).toEqual([]);
  });

  it("remindBeforeHours có số trùng -> được bỏ trùng và sắp giảm dần", async () => {
    const res = await postAssignment(
      validBody({ remindBeforeHours: [1, 24, 1, 24, 168] }),
      users.teacher
    );
    expect(res.status).toBe(201);
    expect(res.body.data?.remindBeforeHours).toEqual([168, 24, 1]);
  });

  it("giao cùng một bài cho cùng lớp nhiều lần -> cả hai đều 201, ra 2 assignment khác nhau", async () => {
    const a = await postAssignment(validBody(), users.teacher);
    const b = await postAssignment(validBody({ dueAt: futureIso(96) }), users.teacher);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data?.id).not.toBe(b.body.data?.id);
  });

  it("body có assignedById giả -> bị bỏ qua, vẫn lấy từ token", async () => {
    const res = await postAssignment(
      validBody({ assignedById: users.teacher2 }),
      users.teacher
    );
    expect(res.status).toBe(201);
    expect(res.body.data?.assignedById).toBe(users.teacher);
  });

  it("dueAt có múi giờ +07:00 -> 201, lưu đúng thời điểm", async () => {
    const target = new Date(Date.now() + 5 * 24 * HOUR);
    // Cùng một thời điểm, viết theo giờ Việt Nam
    const vn = new Date(target.getTime() + 7 * HOUR)
      .toISOString()
      .replace("Z", "+07:00");
    const res = await postAssignment(validBody({ dueAt: vn }), users.teacher);
    expect(res.status).toBe(201);
    expect(new Date(res.body.data?.dueAt as string).getTime()).toBe(
      target.getTime()
    );
  });
});

describe("POST /api/v1/assignments - bài không hợp lệ -> 404/422", () => {
  it("bài DRAFT của GV khác -> 404", async () => {
    const res = await postAssignment(
      validBody({ exerciseId: ids.otherDraft }),
      users.teacher
    );
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
  });

  it("bài HIDDEN của chính GV -> 404", async () => {
    const res = await postAssignment(
      validBody({ exerciseId: ids.ownHidden }),
      users.teacher
    );
    expect(res.status).toBe(404);
  });

  it("bài HIDDEN của GV khác -> 404", async () => {
    const res = await postAssignment(
      validBody({ exerciseId: ids.otherHidden }),
      users.teacher
    );
    expect(res.status).toBe(404);
  });

  it("bài không tồn tại -> 404", async () => {
    const res = await postAssignment(
      validBody({ exerciseId: 2147483000 }),
      users.teacher
    );
    expect(res.status).toBe(404);
  });

  it("bài writing (PUBLISHED) -> 422 TYPE_NOT_ASSIGNABLE, không tạo assignment", async () => {
    const before = await prisma.assignment.count({
      where: { exerciseId: ids.writingPublished },
    });
    const res = await postAssignment(
      validBody({ exerciseId: ids.writingPublished }),
      users.teacher
    );
    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe("TYPE_NOT_ASSIGNABLE");
    const after = await prisma.assignment.count({
      where: { exerciseId: ids.writingPublished },
    });
    expect(after).toBe(before);
  });
});

describe("POST /api/v1/assignments - lớp không hợp lệ -> 404", () => {
  it("lớp của GV khác -> 404 (không giao được)", async () => {
    const before = await prisma.assignment.count({
      where: { classId: ids.classOther },
    });
    const res = await postAssignment(
      validBody({ classId: ids.classOther }),
      users.teacher
    );
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
    const after = await prisma.assignment.count({
      where: { classId: ids.classOther },
    });
    expect(after).toBe(before);
  });

  it("lớp không tồn tại -> 404", async () => {
    const res = await postAssignment(
      validBody({ classId: 2147483000 }),
      users.teacher
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/assignments - dữ liệu sai -> 400", () => {
  const expect400 = async (overrides: Record<string, unknown>) => {
    const res = await postAssignment(validBody(overrides), users.teacher);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  };

  it("dueAt trong quá khứ", () => expect400({ dueAt: futureIso(-1) }));
  it("dueAt không phải ngày giờ", () => expect400({ dueAt: "mai nhé" }));
  it("dueAt thiếu múi giờ", () => expect400({ dueAt: "2099-12-01T10:00:00" }));
  it("dueAt là số", () => expect400({ dueAt: 1799999999999 }));
  it("thiếu dueAt", () => expect400({ dueAt: undefined }));
  it("thiếu exerciseId", () => expect400({ exerciseId: undefined }));
  it("thiếu classId", () => expect400({ classId: undefined }));
  it("exerciseId là chuỗi", () => expect400({ exerciseId: "5" }));
  it("classId âm", () => expect400({ classId: -1 }));
  it("classId thập phân", () => expect400({ classId: 1.5 }));
  it("exerciseId vượt INT", () => expect400({ exerciseId: 99999999999 }));
  it("remindBeforeHours không phải mảng", () =>
    expect400({ remindBeforeHours: 24 }));
  it("remindBeforeHours có số 0", () => expect400({ remindBeforeHours: [0] }));
  it("remindBeforeHours có số âm", () => expect400({ remindBeforeHours: [-1] }));
  it("remindBeforeHours có số thập phân", () =>
    expect400({ remindBeforeHours: [1.5] }));
  it("remindBeforeHours có chuỗi", () =>
    expect400({ remindBeforeHours: ["24"] }));
  it("remindBeforeHours có số > 168", () =>
    expect400({ remindBeforeHours: [169] }));
  it("remindBeforeHours quá 5 phần tử", () =>
    expect400({ remindBeforeHours: [1, 2, 3, 4, 5, 6] }));

  it("remindBeforeHours đúng 5 phần tử và 168 giờ -> hợp lệ", async () => {
    const res = await postAssignment(
      validBody({ remindBeforeHours: [1, 2, 3, 4, 168] }),
      users.teacher
    );
    expect(res.status).toBe(201);
  });

  it("body rỗng -> 400", async () => {
    const res = await postAssignment({}, users.teacher);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/assignments - phân quyền", () => {
  it("không token -> 401", async () => {
    const res = await postAssignment(validBody());
    expect(res.status).toBe(401);
  });

  it("STUDENT -> 403", async () => {
    const res = await postAssignment(validBody(), users.student);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("ADMIN -> 403 (chỉ GV chủ lớp được giao bài)", async () => {
    const res = await postAssignment(validBody(), users.admin);
    expect(res.status).toBe(403);
  });

  it("STUDENT gửi body sai vẫn nhận 403 (kiểm quyền trước kiểm body)", async () => {
    const res = await postAssignment({}, users.student);
    expect(res.status).toBe(403);
  });
});