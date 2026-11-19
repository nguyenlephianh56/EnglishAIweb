import { Role, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../app";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { teacherGradeSchema } from "./attempts.grade.schema";
import { updateTeacherGrade } from "./attempts.grade.service";

const GRADE_ACTION = "attempt.teacher_grade";

describe("T20 – kiểm tra đầu vào", () => {
  it("làm tròn điểm và trim nhận xét", () => {
    expect(teacherGradeSchema.parse({ teacher_score: 7.456, teacher_comment: "  Tốt  " }))
      .toEqual({ teacher_score: 7.46, teacher_comment: "Tốt" });
  });

  it("làm tròn đúng tại mốc giữa 9.99 và 10", () => {
    expect(teacherGradeSchema.parse({ teacher_score: 9.995 })).toEqual({ teacher_score: 10 });
  });

  it.each([0, 10, null])("chấp nhận điểm %j", (teacher_score) => {
    expect(teacherGradeSchema.parse({ teacher_score })).toEqual({ teacher_score });
  });

  it.each([[-0.01], [10.01], [NaN], [Infinity], ["7"], [[]]])("từ chối điểm %j", (teacher_score) => {
    expect(teacherGradeSchema.safeParse({ teacher_score }).success).toBe(false);
  });

  it("chấp nhận null và nhận xét đúng 1.000 ký tự sau trim", () => {
    const comment = "a".repeat(1000);
    expect(teacherGradeSchema.parse({ teacher_comment: ` ${comment} ` }))
      .toEqual({ teacher_comment: comment });
    expect(teacherGradeSchema.parse({ teacher_comment: null })).toEqual({ teacher_comment: null });
  });

  it.each([
    ["rỗng", ""],
    ["toàn khoảng trắng", "   "],
    ["quá giới hạn", "a".repeat(1001)],
  ])("từ chối nhận xét %s", (_label, teacher_comment) => {
    expect(teacherGradeSchema.safeParse({ teacher_comment }).success).toBe(false);
  });
});

describe("T20 – PATCH /api/v1/attempts/:id/grade", () => {
  const prefix = `t20_${randomUUID()}`;
  const users: Record<string, number> = {};
  let server: Server | undefined;
  let baseUrl: string;
  let assignedId: number;
  let practiceId: number;
  let assignmentId: number;
  let pastAssignmentId: number;
  let exerciseId: number;

  const authorization = (user: string) => ({
    Authorization: `Bearer ${jwt.sign({ userId: users[user] }, env.JWT_SECRET)}`,
  });

  const request = (id: number | string, user?: string, body: object = { teacher_score: 7 }) =>
    fetch(`${baseUrl}/api/v1/attempts/${id}/grade`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(user ? authorization(user) : {}),
      },
      body: JSON.stringify(body),
    });

  const createAssignedAttempt = (score: number | null, targetAssignmentId = assignmentId) =>
    prisma.attempt.create({
      data: {
        studentId: users.student,
        exerciseId,
        assignmentId: targetAssignmentId,
        answer: { text: "Hello." },
        score,
      },
    });

  const audit = (attemptId: number) => prisma.auditLog.findMany({
    where: { action: GRADE_ACTION, detail: { path: ["attempt_id"], equals: attemptId } },
    orderBy: { id: "asc" },
    select: { userId: true, detail: true },
  });

  beforeAll(async () => {
    const accounts = [
      ["owner", Role.TEACHER, UserStatus.ACTIVE],
      ["other", Role.TEACHER, UserStatus.ACTIVE],
      ["student", Role.STUDENT, UserStatus.ACTIVE],
      ["observer", Role.STUDENT, UserStatus.ACTIVE],
      ["admin", Role.ADMIN, UserStatus.ACTIVE],
      ["pending", Role.TEACHER, UserStatus.PENDING],
      ["locked", Role.TEACHER, UserStatus.LOCKED],
    ] as const;

    for (const [name, role, status] of accounts) {
      const user = await prisma.user.create({
        data: { name, email: `${prefix}_${name}@test.local`, passwordHash: "unused", role, status },
      });
      users[name] = user.id;
    }

    const classroom = await prisma.class.create({
      data: { name: prefix, code: randomBytes(3).toString("hex").toUpperCase(), teacherId: users.owner },
    });
    await prisma.classMember.create({ data: { classId: classroom.id, studentId: users.student } });
    const exercise = await prisma.exercise.create({
      data: {
        type: "writing",
        skill: "WRITING",
        level: "A1",
        topic: prefix,
        content: { prompt: "Write a sentence." },
        source: "TEACHER",
        createdById: users.owner,
      },
    });
    exerciseId = exercise.id;
    const createAssignment = (dueAt: Date) => prisma.assignment.create({
      data: { classId: classroom.id, assignedById: users.owner, exerciseId, dueAt },
    });
    assignmentId = (await createAssignment(new Date(Date.now() + 3_600_000))).id;
    pastAssignmentId = (await createAssignment(new Date(Date.now() - 3_600_000))).id;
    assignedId = (await createAssignedAttempt(null)).id;
    practiceId = (await prisma.attempt.create({
      data: { studentId: users.student, exerciseId, answer: { text: "Hello." } },
    })).id;

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) {
      const runningServer = server;
      await new Promise<void>((resolve) => runningServer.close(() => resolve()));
    }
    const ids = Object.values(users);
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids }, action: GRADE_ACTION } });
    await prisma.attempt.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.class.deleteMany({ where: { teacherId: { in: ids } } });
    await prisma.exercise.deleteMany({ where: { createdById: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("thiếu token trả 401", async () => {
    expect((await request(assignedId)).status).toBe(401);
  });

  it.each(["student", "pending", "locked"])("%s trả 403 trước khi kiểm tra id", async (user) => {
    expect((await request("abc", user)).status).toBe(403);
  });

  it("route dùng middleware xác thực cũ vẫn trả 401 cho tài khoản bị khóa", async () => {
    const res = await fetch(`${baseUrl}/api/v1/attempts/${assignedId}`, {
      headers: authorization("locked"),
    });
    expect(res.status).toBe(401);
  });

  it.each(["owner", "admin"])("%s truy cập được bài giao chưa có điểm AI", async (user) => {
    const { id } = await createAssignedAttempt(null);
    const res = await request(id, user);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { id, score: null, teacher_score: 7, teacher_comment: null, final_score: 7, max_score: 10 },
      error: null,
    });
  });

  it("GV lớp khác, attempt không tồn tại và tự luyện đều trả cùng 404", async () => {
    const responses = await Promise.all([
      request(assignedId, "other"),
      request(2147483647, "owner"),
      request(practiceId, "owner"),
      request(practiceId, "admin"),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        data: null,
        error: { code: "NOT_FOUND", message: "Không tìm thấy bài nộp" },
      });
    }
    const rows = await prisma.attempt.findMany({
      where: { id: { in: [assignedId, practiceId] } },
      select: { teacherScore: true, teacherComment: true },
    });
    expect(rows).toEqual(Array(2).fill({ teacherScore: null, teacherComment: null }));
    expect(await audit(assignedId)).toEqual([]);
    expect(await audit(practiceId)).toEqual([]);
  });

  it.each([
    {},
    { teacher_score: 7, score: 2 },
    { teacher_score: 7, is_late: true },
    { teacher_score: 7, student_id: 2 },
  ])("body %j trả 400", async (body) => {
    expect((await request(assignedId, "owner", body)).status).toBe(400);
  });

  it.each(["abc", "0", "1.5", "2147483648"])("id %s trả 400", async (id) => {
    expect((await request(id, "owner")).status).toBe(400);
  });

  it("ghi điểm và nhận xét, bỏ qua PATCH lặp, ghi audit đúng cho mỗi lần đổi", async () => {
    const { id } = await createAssignedAttempt(6);
    const comment = "Nhận xét riêng";
    const grade = { teacher_score: 7.456, teacher_comment: `  ${comment}  ` };
    const first = await request(id, "owner", grade);
    expect(first.status).toBe(200);
    const firstBody = {
      data: { id, score: 6, teacher_score: 7.46, teacher_comment: comment, final_score: 7.46, max_score: 10 },
      error: null,
    };
    expect(await first.json()).toEqual(firstBody);

    const repeated = await request(id, "owner", grade);
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual(firstBody);
    expect(await audit(id)).toHaveLength(1);

    const changedComment = await request(id, "owner", { teacher_comment: "Đã sửa nhận xét" });
    expect(changedComment.status).toBe(200);
    expect((await changedComment.json()).data).toMatchObject({
      teacher_comment: "Đã sửa nhận xét", teacher_score: 7.46, final_score: 7.46,
    });

    const changedScore = await request(id, "owner", { teacher_score: 0 });
    expect(changedScore.status).toBe(200);
    expect((await changedScore.json()).data).toMatchObject({
      teacher_comment: "Đã sửa nhận xét", teacher_score: 0, final_score: 0,
    });

    const cleared = await request(id, "owner", { teacher_score: null, teacher_comment: null });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).data).toMatchObject({
      teacher_comment: null, teacher_score: null, final_score: 6,
    });
    const detail = { attempt_id: id, assignment_id: assignmentId, student_id: users.student };
    expect(await audit(id)).toEqual([
      { userId: users.owner, detail: { ...detail, teacher_score: { from: null, to: 7.46 }, comment_changed: true } },
      { userId: users.owner, detail: { ...detail, teacher_score: { from: 7.46, to: 7.46 }, comment_changed: true } },
      { userId: users.owner, detail: { ...detail, teacher_score: { from: 7.46, to: 0 }, comment_changed: false } },
      { userId: users.owner, detail: { ...detail, teacher_score: { from: 0, to: null }, comment_changed: true } },
    ]);
  });

  it("hai PATCH song song tạo chuỗi audit liên tục", async () => {
    const { id } = await createAssignedAttempt(6);
    const responses = await Promise.all([
      request(id, "owner", { teacher_score: 7 }),
      request(id, "admin", { teacher_score: 8 }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);

    const logs = await audit(id);
    const changes = logs.map((log) =>
      (log.detail as { teacher_score: { from: number | null; to: number } }).teacher_score
    );
    expect(changes).toHaveLength(2);
    expect(changes[0].from).toBeNull();
    expect(changes[1].from).toBe(changes[0].to);
    expect(changes.map((change) => change.to).sort()).toEqual([7, 8]);
    const saved = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(saved.teacherScore).toBe(changes[1].to);
  });

  it("ghi audit lỗi thì rollback điểm và nhận xét", async () => {
    const { id } = await createAssignedAttempt(6);
    // ID người sửa không tồn tại khiến FK của audit_logs từ chối ghi.
    await expect(updateTeacherGrade(
      { id: 2147483647, role: Role.ADMIN }, id, { teacher_score: 9, teacher_comment: "Tốt" }
    )).rejects.toMatchObject({ code: "P2003" });
    const saved = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({ teacherScore: null, teacherComment: null });
    expect(await audit(id)).toEqual([]);
  });

  it("sửa sau hạn và điểm mới hiện ở T4/T5, HS khác không đọc hoặc sửa được", async () => {
    const { id } = await createAssignedAttempt(6, pastAssignmentId);
    expect((await request(id, "owner", { teacher_score: 10 })).status).toBe(200);
    expect((await request(id, "observer")).status).toBe(403);

    const detailUrl = `${baseUrl}/api/v1/attempts/${id}`;
    const detail = await fetch(detailUrl, { headers: authorization("student") });
    expect(detail.status).toBe(200);
    expect((await detail.json()).data).toMatchObject({ finalScore: 10, teacherScore: 10 });
    expect((await fetch(detailUrl, { headers: authorization("observer") })).status).toBe(404);

    const history = await fetch(`${baseUrl}/api/v1/attempts?assignmentId=${pastAssignmentId}`, {
      headers: authorization("student"),
    });
    expect((await history.json()).data).toMatchObject({ bestScore: 10, items: [{ finalScore: 10 }] });

    const submissions = await fetch(`${baseUrl}/api/v1/assignments/${pastAssignmentId}/submissions`, {
      headers: authorization("owner"),
    });
    expect((await submissions.json()).data.items).toMatchObject([{ bestScore: 10, bestAttemptId: id }]);
  });
});