/** T28 graded: luồng nộp/chấm đồng bộ (tự động, AI, regrade) KHÔNG tạo thông báo, vì HS đã thấy kết quả ngay.
 * HTTP + PostgreSQL thật; chỉ mock AI chấm Viết. Chỉ dọn dữ liệu của chính lần chạy này.
 */
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { gradeWritingMock } = vi.hoisted(() => ({ gradeWritingMock: vi.fn() }));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: gradeWritingMock }));

import { AIServiceError } from "../../ai/resilience";
import { app } from "../../app";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const RUN = `t28sync_${randomUUID().replaceAll("-", "")}`;
const ESSAY = "I goes to school every day and enjoy learning English.";
const AI_GRADE = {
  criteria: { content: 7, coherence: 7, vocabulary: 7, grammar: 8 },
  comment: "Bài viết khá tốt.",
  errors: [{ type: "grammar:tense", text: "I goes", correction: "I go" }],
};

const ownedUsers: number[] = [];
let teacher = 0;
let classId = 0;
let fillBlank = 0;
let writing = 0;
let counter = 0;
let server: Server | undefined;
let baseUrl = "";

const createUser = async (role: "STUDENT" | "TEACHER") => {
  const row = await prisma.user.create({
    data: {
      name: `${RUN}_${++counter}`,
      email: `${RUN}_${counter}@test.local`,
      passwordHash: "test-only-hash",
      role,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  ownedUsers.push(row.id);
  return row.id;
};
const student = async () => {
  const id = await createUser("STUDENT");
  await prisma.classMember.create({ data: { classId, studentId: id } });
  return id;
};
const newExercise = async (
  type: string,
  skill: "FOUNDATION" | "WRITING",
  content: Prisma.InputJsonValue,
  answer: Prisma.InputJsonValue | null
) =>
  (await prisma.exercise.create({
    data: {
      type,
      skill,
      level: "A2",
      topic: `${RUN}_${++counter}`,
      content,
      ...(answer === null ? {} : { answer }),
      status: "PUBLISHED",
      source: "TEACHER",
      inLibrary: true,
      createdById: teacher,
    },
    select: { id: true },
  })).id;

const request = async (userId: number, path: string, body?: unknown) => {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt.sign({ userId }, env.JWT_SECRET)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = JSON.parse(await res.text());
  return { status: res.status, data: parsed.data };
};
const submit = (id: number, exerciseId: number, answer: unknown) =>
  request(id, "/attempts", { exerciseId, answer });

// Không lọc theo loại: HS của luồng đồng bộ không được có BẤT KỲ thông báo nào.
const notificationCount = (userId: number) => prisma.notification.count({ where: { userId } });

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  teacher = await createUser("TEACHER");
  classId = (await prisma.class.create({
    data: { name: RUN, code: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(), teacherId: teacher },
    select: { id: true },
  })).id;
  fillBlank = await newExercise("fill_blank", "FOUNDATION", { text: "She ___ to ___." }, ["goes", "school"]);
  writing = await newExercise("writing", "WRITING", { prompt: "Write about your day", minWords: 1 }, null);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  gradeWritingMock.mockReset().mockResolvedValue(structuredClone(AI_GRADE));
});

afterAll(async () => {
  try {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (ownedUsers.length) {
      const ids = { in: ownedUsers };
      await prisma.notification.deleteMany({ where: { userId: ids } });
      await prisma.attempt.deleteMany({ where: { studentId: ids } });
      await prisma.skillProfile.deleteMany({ where: { studentId: ids } });
      await prisma.aiUsageLog.deleteMany({ where: { userId: ids } });
      await prisma.class.deleteMany({ where: { teacherId: ids } });
      await prisma.exercise.deleteMany({ where: { createdById: ids } });
      await prisma.user.deleteMany({ where: { id: ids } });
    }
  } finally {
    await prisma.$disconnect();
  }
});

describe("T28 graded – luồng chấm đồng bộ không tạo thông báo", () => {
  it("nộp bài tự động (fill_blank) → HS thấy điểm ngay, 0 thông báo", async () => {
    const id = await student();

    expect((await submit(id, fillBlank, ["goes", "school"])).status).toBe(201);

    expect(await prisma.attempt.count({ where: { studentId: id, score: { not: null } } })).toBe(1);
    expect(await notificationCount(id)).toBe(0);
  });

  it("nộp bài Viết, AI chấm xong ngay → 0 thông báo", async () => {
    const id = await student();

    expect((await submit(id, writing, { text: ESSAY })).status).toBe(201);

    expect(gradeWritingMock).toHaveBeenCalledTimes(1);
    expect(await notificationCount(id)).toBe(0);
  });

  it("AI lỗi (chờ chấm) rồi POST /attempts/:id/regrade thành công → 0 thông báo ở cả hai bước", async () => {
    const id = await student();
    gradeWritingMock.mockRejectedValueOnce(new AIServiceError("RATE_LIMITED", 1));
    const pending = await submit(id, writing, { text: ESSAY });
    expect(pending.status).toBe(202);
    const attemptId = pending.data.attemptId as number;
    expect(await notificationCount(id)).toBe(0);

    const res = await request(id, `/attempts/${attemptId}/regrade`);

    expect(res.status).toBe(200);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } })).score).not.toBeNull();
    expect(await notificationCount(id)).toBe(0);
  });
});