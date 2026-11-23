import { randomUUID } from "node:crypto";
import type { UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, createAuthorizationFixtures, startAuthorizationApp } from "../../testing/authorization-fixtures";
import { gradedNotificationKey, teacherEditNotificationKey } from "./notifications.constants";
import { createGradedNotification } from "./notifications.graded.service";

// Bọc hàm thật để test có thể giả lập lỗi tạo thông báo (best-effort), các test khác chạy hàm thật.
vi.mock("./notifications.graded.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notifications.graded.service")>();
  return { ...actual, createGradedNotification: vi.fn(actual.createGradedNotification) };
});

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Actor = keyof Fixtures["actors"];

const GRADE_ACTION = "attempt.teacher_grade";
const topic = `T28 graded grade ${randomUUID()}`;
const className = "T22 Class A"; // tên lớp của classA trong authorization-fixtures
const missingId = 2_147_483_647;

let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;
let exerciseId: number;
let assignmentId: number;
const extraUserIds: number[] = [];
const attemptIds: number[] = [];

async function createStudent(status: UserStatus) {
  const { id } = await prisma.user.create({
    data: {
      name: "Học sinh test graded chấm tay",
      email: `t28-graded-grade-${randomUUID()}@example.test`,
      passwordHash: "t28-test-fixture",
      role: "STUDENT",
      status,
    },
    select: { id: true },
  });
  extraUserIds.push(id);
  return id;
}

// Mặc định: bài nộp CHƯA có điểm (score null, chưa chấm tay), thuộc bài giao của lớp A.
async function createAttempt({
  studentId = fixtures.actors.studentA.id,
  score = null as number | null,
  inAssignment = true,
  teacherScore = null as number | null,
  teacherComment = null as string | null,
} = {}) {
  const { id } = await prisma.attempt.create({
    data: {
      studentId,
      exerciseId,
      assignmentId: inAssignment ? assignmentId : null,
      answer: { text: "Hello." },
      score,
      teacherScore,
      teacherComment,
    },
    select: { id: true },
  });
  attemptIds.push(id);
  return id;
}

function patchGrade(attemptId: number | string, actor: Actor | null, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (actor) Object.assign(headers, authorizationHeaders(fixtures.actors[actor]));
  return app.request(`/attempts/${attemptId}/grade`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function listNotifications(actor: Actor) {
  return app.request(
    "/notifications?limit=50",
    { headers: authorizationHeaders(fixtures.actors[actor]) },
    { forbiddenKeys: ["user_id", "userId"] }
  );
}

// Không lọc theo user để bắt cả trường hợp thông báo bị gửi nhầm cho người khác.
const gradedRows = (attemptId: number) => prisma.notification.findMany({
  where: { type: gradedNotificationKey(attemptId) },
  orderBy: { id: "asc" },
});
const editRows = (attemptId: number) => prisma.notification.findMany({
  where: { type: teacherEditNotificationKey(attemptId) },
  orderBy: { id: "asc" },
});

const gradeBody = (
  id: number,
  fields: { score?: number | null; teacher_score: number | null; teacher_comment?: string | null }
) => {
  const { score = null, teacher_score, teacher_comment = null } = fields;
  return {
    data: {
      id,
      score,
      teacher_score,
      teacher_comment,
      final_score: teacher_score ?? score,
      max_score: 10,
    },
    error: null,
  };
};

const ok = (body: unknown) => ({ status: 200, body });

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test graded.");
  }

  fixtures = await createAuthorizationFixtures();
  exerciseId = (await prisma.exercise.create({
    data: {
      type: "writing",
      skill: "WRITING",
      level: "A1",
      topic,
      content: { prompt: "Write a sentence." },
      source: "TEACHER",
      createdById: fixtures.actors.teacherA.id,
    },
    select: { id: true },
  })).id;
  assignmentId = (await prisma.assignment.create({
    data: {
      classId: fixtures.classes.classA.id,
      assignedById: fixtures.actors.teacherA.id,
      exerciseId,
      dueAt: new Date(Date.now() + 3_600_000),
    },
    select: { id: true },
  })).id;
  app = await startAuthorizationApp(fixtures.forbiddenValues);
});

afterAll(async () => {
  await app?.close();
  const actorIds = fixtures ? Object.values(fixtures.actors).map(({ id }) => id) : [];
  await prisma.auditLog.deleteMany({ where: { userId: { in: actorIds }, action: GRADE_ACTION } });
  await prisma.attempt.deleteMany({ where: { id: { in: attemptIds } } });
  await prisma.assignment.deleteMany({ where: { exerciseId } });
  await prisma.exercise.deleteMany({ where: { id: exerciseId } });
  await prisma.notification.deleteMany({ where: { userId: { in: [...actorIds, ...extraUserIds] } } });
  await fixtures?.cleanup();
  await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
});

describe("T28 graded – GV/ADMIN chấm tay lần đầu cho bài chưa có điểm cuối", () => {
  it("GV đặt teacher_score: đúng 1 dòng graded cho đúng HS, chưa đọc, không có teacher_edit; response PATCH giữ nguyên", async () => {
    const id = await createAttempt();

    expect(await patchGrade(id, "teacherA", { teacher_score: 7 })).toEqual(
      ok(gradeBody(id, { teacher_score: 7 }))
    );

    const rows = await gradedRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: fixtures.actors.studentA.id,
      type: `graded:${id}`,
      message: `Giáo viên đã chấm bài «${topic}» của lớp ${className}.`,
      readAt: null,
    });
        expect(rows[0].message.replace(topic, "").replace(className, "")).not.toMatch(/\d/);
    expect(await editRows(id)).toHaveLength(0);
  });

  it("PATCH đồng thời có cả teacher_comment: vẫn đúng 1 dòng graded, không có thêm teacher_edit, message không chứa nhận xét", async () => {
    const id = await createAttempt();
    const comment = `Nhận xét bí mật ${randomUUID()}`;

    expect(await patchGrade(id, "teacherA", { teacher_score: 8.5, teacher_comment: comment })).toEqual(
      ok(gradeBody(id, { teacher_score: 8.5, teacher_comment: comment }))
    );

    const rows = await gradedRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).not.toContain(comment);
    expect(await editRows(id)).toHaveLength(0);
  });

  it("ADMIN chấm: 1 dòng graded cho HS của bài", async () => {
    const id = await createAttempt();

    expect((await patchGrade(id, "admin", { teacher_score: 5 })).status).toBe(200);

    const rows = await gradedRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(fixtures.actors.studentA.id);
    expect(await editRows(id)).toHaveLength(0);
  });

  it("lần sửa sau chỉ sinh teacher_edit: graded vẫn đúng 1 dòng", async () => {
    const id = await createAttempt();

    expect((await patchGrade(id, "teacherA", { teacher_score: 6 })).status).toBe(200);
    expect((await patchGrade(id, "teacherA", { teacher_score: 7 })).status).toBe(200);

    expect(await gradedRows(id)).toHaveLength(1);
    expect(await editRows(id)).toHaveLength(1);
  });
});

describe("T28 graded – các ca KHÔNG tạo graded", () => {
  it("chỉ đổi teacher_comment trên bài chưa có điểm cuối → lưu nhận xét, 0 graded, 0 teacher_edit", async () => {
    const id = await createAttempt();

    expect(await patchGrade(id, "teacherA", { teacher_comment: "Cần cố gắng thêm" })).toEqual(
      ok(gradeBody(id, { teacher_score: null, teacher_comment: "Cần cố gắng thêm" }))
    );

    expect((await prisma.attempt.findUniqueOrThrow({ where: { id } })).teacherComment).toBe("Cần cố gắng thêm");
    expect(await gradedRows(id)).toHaveLength(0);
    expect(await editRows(id)).toHaveLength(0);
  });

  it("PATCH không đổi gì (cùng giá trị) → 200, 0 graded, 0 teacher_edit", async () => {
    const noScore = await createAttempt();
    const scored = await createAttempt({ teacherScore: 7 });

    expect((await patchGrade(noScore, "teacherA", { teacher_score: null })).status).toBe(200);
    expect((await patchGrade(scored, "teacherA", { teacher_score: 7 })).status).toBe(200);

    for (const id of [noScore, scored]) {
      expect(await gradedRows(id)).toHaveLength(0);
      expect(await editRows(id)).toHaveLength(0);
    }
  });

  it("bài có score khác null và GV đặt teacher_score → chỉ teacher_edit, không graded", async () => {
    const id = await createAttempt({ score: 6 });

    expect(await patchGrade(id, "teacherA", { teacher_score: 7 })).toEqual(
      ok(gradeBody(id, { score: 6, teacher_score: 7 }))
    );

    expect(await gradedRows(id)).toHaveLength(0);
    expect(await editRows(id)).toHaveLength(1);
  });

  it("GV lớp khác, bài tự luyện, bài không tồn tại → cùng 404, 0 dòng graded", async () => {
    const assignedId = await createAttempt();
    const practiceId = await createAttempt({ inAssignment: false });

    for (const [id, actor] of [
      [assignedId, "teacherB"],
      [practiceId, "teacherA"],
      [practiceId, "admin"],
      [missingId, "teacherA"],
    ] as const) {
      expect((await patchGrade(id, actor, { teacher_score: 7 })).status).toBe(404);
    }

    for (const id of [assignedId, practiceId, missingId]) {
      expect(await gradedRows(id)).toHaveLength(0);
    }
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: assignedId } })).teacherScore).toBeNull();
  });

  it("HS LOCKED hoặc PENDING → PATCH vẫn 200 và lưu điểm, 0 dòng graded", async () => {
    for (const status of ["LOCKED", "PENDING"] as const) {
      const studentId = await createStudent(status);
      const id = await createAttempt({ studentId });

      expect(await patchGrade(id, "teacherA", { teacher_score: 7 })).toEqual(
        ok(gradeBody(id, { teacher_score: 7 }))
      );

      expect((await prisma.attempt.findUniqueOrThrow({ where: { id } })).teacherScore).toBe(7);
      expect(await gradedRows(id)).toHaveLength(0);
    }
  });

  it("body sai → 400; không token → 401; HS và GV PENDING/LOCKED → 403; đều 0 dòng và không đổi dữ liệu", async () => {
    const id = await createAttempt();

    expect((await patchGrade(id, "teacherA", {})).status).toBe(400);
    expect((await patchGrade(id, "teacherA", { teacher_score: 11 })).status).toBe(400);
    expect((await patchGrade(id, "teacherA", { teacher_score: 7, extra: true })).status).toBe(400);
    expect((await patchGrade(id, null, { teacher_score: 7 })).status).toBe(401);
    expect((await patchGrade(id, "studentA", { teacher_score: 7 })).status).toBe(403);
    expect((await patchGrade(id, "pendingTeacher", { teacher_score: 7 })).status).toBe(403);
    expect((await patchGrade(id, "lockedTeacher", { teacher_score: 7 })).status).toBe(403);

    expect(await gradedRows(id)).toHaveLength(0);
    expect(await editRows(id)).toHaveLength(0);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id } })).teacherScore).toBeNull();
  });
});

describe("T28 teacher_edit mở rộng – đã có điểm cuối nhờ chấm tay (score null)", () => {
  it("bài score null đã có teacher_score, GV sửa điểm → 1 teacher_edit, không graded", async () => {
    const id = await createAttempt({ teacherScore: 7 });

    expect(await patchGrade(id, "teacherA", { teacher_score: 8 })).toEqual(
      ok(gradeBody(id, { teacher_score: 8 }))
    );

    const rows = await editRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe(`Giáo viên đã cập nhật điểm bài «${topic}» của lớp ${className}.`);
    expect(await gradedRows(id)).toHaveLength(0);
  });

  it("bài score null đã có teacher_score, GV chỉ đổi nhận xét → 1 teacher_edit (nhận xét), không graded", async () => {
    const id = await createAttempt({ teacherScore: 7 });

    expect((await patchGrade(id, "teacherA", { teacher_comment: "Khá tốt" })).status).toBe(200);

    const rows = await editRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe(`Giáo viên đã cập nhật nhận xét bài «${topic}» của lớp ${className}.`);
    expect(await gradedRows(id)).toHaveLength(0);
  });

  it("GV xóa điểm ghi đè (về null) trên bài đã có điểm cuối → 1 teacher_edit, không graded", async () => {
    const id = await createAttempt({ teacherScore: 9 });

    expect(await patchGrade(id, "teacherA", { teacher_score: null })).toEqual(
      ok(gradeBody(id, { teacher_score: null }))
    );

    expect(await editRows(id)).toHaveLength(1);
    expect(await gradedRows(id)).toHaveLength(0);
  });

  it("giới hạn đã biết: GV xóa điểm về null rồi chấm lại có thể tạo graded lần nữa (chưa chống spam)", async () => {
    const id = await createAttempt();

    expect((await patchGrade(id, "teacherA", { teacher_score: 7 })).status).toBe(200);
    expect((await patchGrade(id, "teacherA", { teacher_score: null })).status).toBe(200);
    expect((await patchGrade(id, "teacherA", { teacher_score: 8 })).status).toBe(200);

    expect(await gradedRows(id)).toHaveLength(2);
    expect(await editRows(id)).toHaveLength(1);
  });
});

describe("T28 graded – best-effort", () => {
  it("lỗi tạo graded không làm hỏng PATCH: vẫn 200, dữ liệu + audit đã lưu, response y như khi không lỗi, log chỉ có mã", async () => {
    const id = await createAttempt();
    const comment = `Nhận xét riêng ${randomUUID()}`;
    const failure = new Error(`boom student=${fixtures.actors.studentA.id} comment=${comment}`);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      vi.mocked(createGradedNotification).mockRejectedValueOnce(failure);

      expect(await patchGrade(id, "teacherA", { teacher_score: 7, teacher_comment: comment })).toEqual(
        ok(gradeBody(id, { teacher_score: 7, teacher_comment: comment }))
      );

      expect(errorLog.mock.calls).toEqual([["GRADED_NOTIFY_FAILED"]]);
      const logged = JSON.stringify(errorLog.mock.calls);
      expect(logged).not.toContain(comment);
      expect(logged).not.toContain(String(fixtures.actors.studentA.id));
      expect(logged).not.toContain("Giáo viên");
    } finally {
      errorLog.mockRestore();
    }

    const saved = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(saved.teacherScore).toBe(7);
    expect(saved.teacherComment).toBe(comment);
    expect(await prisma.auditLog.count({
      where: { action: GRADE_ACTION, detail: { path: ["attempt_id"], equals: id } },
    })).toBe(1);
    expect(await gradedRows(id)).toHaveLength(0);

    // Lần PATCH sau: bài đã có điểm cuối nên là teacher_edit (graded không "bù" lại).
    expect((await patchGrade(id, "teacherA", { teacher_score: 8 })).status).toBe(200);
    expect(await editRows(id)).toHaveLength(1);
    expect(await gradedRows(id)).toHaveLength(0);
  });
});

describe("T28 graded – API thông báo T25", () => {
  it("HS nhận thấy item graded (assignment_id null, chưa đọc), unread_count +1; HS khác, GV và ADMIN không thấy", async () => {
    const id = await createAttempt();
    const before = await listNotifications("studentA");
    expect(before.status).toBe(200);
    const unreadBefore = (before.body as { data: { unread_count: number } }).data.unread_count;

    expect((await patchGrade(id, "teacherA", { teacher_score: 7 })).status).toBe(200);

    const [row] = await gradedRows(id);
    const after = await listNotifications("studentA");
    expect(after.status).toBe(200);
    const data = (after.body as { data: { items: unknown[]; unread_count: number } }).data;
    expect(data.unread_count).toBe(unreadBefore + 1);
    expect(data.items).toContainEqual({
      id: row.id,
      type: "graded",
      message: `Giáo viên đã chấm bài «${topic}» của lớp ${className}.`,
      read: false,
      read_at: null,
      created_at: row.createdAt.toISOString(),
      assignment_id: null,
    });

    for (const actor of ["studentB", "teacherA", "teacherB", "admin"] as const) {
      const other = await listNotifications(actor);
      expect(other.status).toBe(200);
      const items = (other.body as { data: { items: { id: number }[] } }).data.items;
      expect(items.some((item) => item.id === row.id)).toBe(false);
    }
  });
});