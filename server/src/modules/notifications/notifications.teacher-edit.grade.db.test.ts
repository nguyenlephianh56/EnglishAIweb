import { randomUUID } from "node:crypto";
import type { UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, createAuthorizationFixtures, startAuthorizationApp } from "../../testing/authorization-fixtures";
import { teacherEditNotificationKey } from "./notifications.constants";
import { createTeacherEditNotification } from "./notifications.teacher-edit.service";

// Bọc hàm thật để test có thể giả lập lỗi tạo thông báo (best-effort), các test khác chạy hàm thật.
vi.mock("./notifications.teacher-edit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notifications.teacher-edit.service")>();
  return { ...actual, createTeacherEditNotification: vi.fn(actual.createTeacherEditNotification) };
});

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Actor = keyof Fixtures["actors"];

const GRADE_ACTION = "attempt.teacher_grade";
const topic = `T28 grade ${randomUUID()}`;
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
      name: "Học sinh test chấm tay",
      email: `t28-grade-${randomUUID()}@example.test`,
      passwordHash: "t28-test-fixture",
      role: "STUDENT",
      status,
    },
    select: { id: true },
  });
  extraUserIds.push(id);
  return id;
}

async function createAttempt({
  studentId = fixtures.actors.studentA.id,
  score = 6 as number | null,
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
const rowsOf = (attemptId: number) => prisma.notification.findMany({
  where: { type: teacherEditNotificationKey(attemptId) },
  orderBy: { id: "asc" },
});

const gradeBody = (
  id: number,
  fields: { score?: number | null; teacher_score: number | null; teacher_comment?: string | null }
) => {
  const { score = 6, teacher_score, teacher_comment = null } = fields;
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
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test teacher_edit.");
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

describe("T28 teacher_edit – tạo thông báo khi PATCH chấm tay đổi THẬT", () => {
  it("đổi teacher_score: đúng 1 dòng cho đúng HS, chưa đọc; response PATCH giữ nguyên", async () => {
    const id = await createAttempt();

    expect(await patchGrade(id, "teacherA", { teacher_score: 7 })).toEqual(
      ok(gradeBody(id, { teacher_score: 7 }))
    );

    const rows = await rowsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: fixtures.actors.studentA.id,
      type: `teacher_edit:${id}`,
      message: `Giáo viên đã cập nhật điểm bài «${topic}» của lớp ${className}.`,
      readAt: null,
    });
  });

  it("chỉ đổi teacher_comment: 1 dòng, message không chứa nhận xét", async () => {
    const id = await createAttempt();
    const comment = `Nhận xét bí mật ${randomUUID()}`;

    expect(await patchGrade(id, "teacherA", { teacher_comment: comment })).toEqual(
      ok(gradeBody(id, { teacher_score: null, teacher_comment: comment }))
    );

    const rows = await rowsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe(`Giáo viên đã cập nhật nhận xét bài «${topic}» của lớp ${className}.`);
    expect(rows[0].message).not.toContain(comment);
  });

  it("đổi cả điểm và nhận xét trong một PATCH: 1 dòng (không phải 2)", async () => {
    const id = await createAttempt();

    const response = await patchGrade(id, "teacherA", { teacher_score: 8.5, teacher_comment: "Tốt" });
    expect(response.status).toBe(200);

    const rows = await rowsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe(`Giáo viên đã cập nhật điểm và nhận xét bài «${topic}» của lớp ${className}.`);
  });

  it("xóa ghi đè (teacher_score về null) vẫn là thay đổi thật: 1 dòng", async () => {
    const id = await createAttempt({ teacherScore: 9 });

    expect(await patchGrade(id, "teacherA", { teacher_score: null })).toEqual(
      ok(gradeBody(id, { teacher_score: null }))
    );

    expect(await rowsOf(id)).toHaveLength(1);
  });

  it("ADMIN sửa: 1 dòng cho HS của bài", async () => {
    const id = await createAttempt();

    expect((await patchGrade(id, "admin", { teacher_score: 5 })).status).toBe(200);

    const rows = await rowsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(fixtures.actors.studentA.id);
  });

  it("sửa liên tiếp khi chưa đọc: còn 1 dòng, hợp cờ, created_at tăng, lên đầu và unread_count vẫn 1", async () => {
    const id = await createAttempt();
    const userId = fixtures.actors.studentA.id;
    const oldTime = new Date("2000-01-01T00:00:00Z");
    await prisma.notification.updateMany({
      where: { userId },
      data: { readAt: oldTime, createdAt: oldTime },
    });

    expect((await patchGrade(id, "teacherA", { teacher_score: 6.5 })).status).toBe(200);
    const [first] = await rowsOf(id);
    await prisma.notification.update({ where: { id: first.id }, data: { createdAt: oldTime } });
    const marker = await prisma.notification.create({
      data: {
        userId,
        type: "system",
        message: "Thông báo đọc trước để so thứ tự",
        createdAt: new Date("2000-01-02T00:00:00Z"),
        readAt: new Date("2000-01-02T00:00:00Z"),
      },
    });
    const before = (await listNotifications("studentA")).body as {
      data: { items: { id: number }[]; unread_count: number };
    };
    expect(before.data.items.slice(0, 2).map(({ id }) => id)).toEqual([marker.id, first.id]);
    expect(before.data.unread_count).toBe(1);

    expect((await patchGrade(id, "teacherA", { teacher_comment: "Đã xem lại" })).status).toBe(200);

    const rows = await rowsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first.id,
      readAt: null,
      message: `Giáo viên đã cập nhật điểm và nhận xét bài «${topic}» của lớp ${className}.`,
    });
    expect(rows[0].createdAt.getTime()).toBeGreaterThan(oldTime.getTime());
    const after = (await listNotifications("studentA")).body as typeof before;
    expect(after.data.items[0].id).toBe(first.id);
    expect(after.data.unread_count).toBe(1);
  });

  it("đã đọc rồi sửa lại: tạo dòng mới và unread_count tăng", async () => {
    const id = await createAttempt();
    expect((await patchGrade(id, "teacherA", { teacher_score: 7 })).status).toBe(200);
    const [first] = await rowsOf(id);
    const read = await app.request(`/notifications/${first.id}/read`, {
      method: "PATCH",
      headers: authorizationHeaders(fixtures.actors.studentA),
    });
    expect(read.status).toBe(200);
    const [readRow] = await rowsOf(id);
    expect(readRow.readAt).not.toBeNull();
    const before = (await listNotifications("studentA")).body as { data: { unread_count: number } };

    expect((await patchGrade(id, "teacherA", { teacher_comment: "Bổ sung nhận xét" })).status).toBe(200);

    const rows = await rowsOf(id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(readRow);
    expect(rows[1]).toMatchObject({
      readAt: null,
      message: `Giáo viên đã cập nhật nhận xét bài «${topic}» của lớp ${className}.`,
    });
    const after = (await listNotifications("studentA")).body as { data: { unread_count: number } };
    expect(after.data.unread_count).toBe(before.data.unread_count + 1);
  });

  it("hai PATCH song song: đúng 1 dòng chưa đọc cho khóa, đủ cả hai cờ", async () => {
    const id = await createAttempt();

    const replies = await Promise.all([
      patchGrade(id, "teacherA", { teacher_score: 7 }),
      patchGrade(id, "teacherA", { teacher_comment: "Bổ sung nhận xét" }),
    ]);

    expect(replies.map(({ status }) => status)).toEqual([200, 200]);
    const rows = await rowsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      readAt: null,
      message: `Giáo viên đã cập nhật điểm và nhận xét bài «${topic}» của lớp ${className}.`,
    });
  });
});

describe("T28 teacher_edit – các ca KHÔNG tạo thông báo", () => {
  it("PATCH không đổi gì (cùng giá trị) → 200, 0 dòng", async () => {
    const id = await createAttempt({ teacherScore: 7, teacherComment: "Ổn" });

    expect(await patchGrade(id, "teacherA", { teacher_score: 7, teacher_comment: "Ổn" })).toEqual(
      ok(gradeBody(id, { teacher_score: 7, teacher_comment: "Ổn" }))
    );
    expect((await patchGrade(id, "teacherA", { teacher_score: 7.001 })).status).toBe(200); // làm tròn về 7

    expect(await rowsOf(id)).toHaveLength(0);
  });

  it("bài nộp chưa có điểm (chấm tay lần đầu) → lưu điểm, 0 dòng teacher_edit", async () => {
    const id = await createAttempt({ score: null });

    expect(await patchGrade(id, "teacherA", { teacher_score: 7 })).toEqual(
      ok(gradeBody(id, { score: null, teacher_score: 7 }))
    );

    expect((await prisma.attempt.findUniqueOrThrow({ where: { id } })).teacherScore).toBe(7);
    expect(await rowsOf(id)).toHaveLength(0);
  });

  it("GV lớp khác, bài tự luyện, bài không tồn tại → cùng 404, 0 dòng", async () => {
    const assignedId = await createAttempt();
    const practiceId = await createAttempt({ inAssignment: false });

    for (const [id, actor] of [
      [assignedId, "teacherB"],
      [practiceId, "teacherA"],
      [practiceId, "admin"],
      [missingId, "teacherA"],
    ] as const) {
      const response = await patchGrade(id, actor, { teacher_score: 7 });
      expect(response.status).toBe(404);
    }

    expect(await rowsOf(assignedId)).toHaveLength(0);
    expect(await rowsOf(practiceId)).toHaveLength(0);
    expect(await rowsOf(missingId)).toHaveLength(0);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: assignedId } })).teacherScore).toBeNull();
  });

  it("HS LOCKED hoặc PENDING → PATCH vẫn 200 và lưu điểm, 0 dòng", async () => {
    for (const status of ["LOCKED", "PENDING"] as const) {
      const studentId = await createStudent(status);
      const id = await createAttempt({ studentId });

      expect(await patchGrade(id, "teacherA", { teacher_score: 7 })).toEqual(
        ok(gradeBody(id, { teacher_score: 7 }))
      );

      expect((await prisma.attempt.findUniqueOrThrow({ where: { id } })).teacherScore).toBe(7);
      expect(await rowsOf(id)).toHaveLength(0);
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

    expect(await rowsOf(id)).toHaveLength(0);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id } })).teacherScore).toBeNull();
  });
});

describe("T28 teacher_edit – best-effort", () => {
  it("lỗi tạo thông báo không làm hỏng PATCH: vẫn 200, dữ liệu + audit đã lưu, response y như khi không lỗi, log chỉ có mã", async () => {
    const id = await createAttempt();
    const comment = `Nhận xét riêng ${randomUUID()}`;
    const failure = new Error(`boom student=${fixtures.actors.studentA.id} comment=${comment}`);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      vi.mocked(createTeacherEditNotification).mockRejectedValueOnce(failure);

      expect(await patchGrade(id, "teacherA", { teacher_score: 7, teacher_comment: comment })).toEqual(
        ok(gradeBody(id, { teacher_score: 7, teacher_comment: comment }))
      );

      expect(errorLog.mock.calls).toEqual([["TEACHER_EDIT_NOTIFY_FAILED"]]);
      const logged = JSON.stringify(errorLog.mock.calls);
      expect(logged).not.toContain(comment);
      expect(logged).not.toContain(String(fixtures.actors.studentA.id));
    } finally {
      errorLog.mockRestore();
    }

    const saved = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(saved.teacherScore).toBe(7);
    expect(saved.teacherComment).toBe(comment);
    expect(await prisma.auditLog.count({
      where: { action: GRADE_ACTION, detail: { path: ["attempt_id"], equals: id } },
    })).toBe(1);
    expect(await rowsOf(id)).toHaveLength(0);

    // Lần PATCH sau (hàm thật chạy lại) vẫn tạo thông báo bình thường.
    expect((await patchGrade(id, "teacherA", { teacher_score: 8 })).status).toBe(200);
    expect(await rowsOf(id)).toHaveLength(1);
  });
});

describe("T28 teacher_edit – API thông báo T25", () => {
  it("HS thấy teacher_edit với attempt_id đúng và unread_count +1; HS khác, GV và ADMIN không thấy", async () => {
    const id = await createAttempt();
    const before = await listNotifications("studentA");
    expect(before.status).toBe(200);
    const unreadBefore = (before.body as { data: { unread_count: number } }).data.unread_count;

    expect((await patchGrade(id, "teacherA", { teacher_score: 7 })).status).toBe(200);

    const [row] = await rowsOf(id);
    const after = await listNotifications("studentA");
    expect(after.status).toBe(200);
    const data = (after.body as { data: { items: unknown[]; unread_count: number } }).data;
    expect(data.unread_count).toBe(unreadBefore + 1);
    expect(data.items).toContainEqual({
      id: row.id,
      type: "teacher_edit",
      message: `Giáo viên đã cập nhật điểm bài «${topic}» của lớp ${className}.`,
      read: false,
      read_at: null,
      created_at: row.createdAt.toISOString(),
      assignment_id: null,
      attempt_id: id,
    });

    for (const actor of ["studentB", "teacherA", "teacherB", "admin"] as const) {
      const other = await listNotifications(actor);
      expect(other.status).toBe(200);
      const items = (other.body as { data: { items: { id: number }[] } }).data.items;
      expect(items.some((item) => item.id === row.id)).toBe(false);
    }
  });
});