import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { readdir, rm } from "node:fs/promises";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import {
  authorizationHeaders,
  createAuthorizationFixtures,
  startAuthorizationApp,
} from "./authorization-fixtures";

const fakeGenerate = vi.hoisted(() => vi.fn());
vi.mock("../ai/gemini.provider", () => ({
  GeminiProvider: class {
    readonly name = "t22-fake";
    generate = fakeGenerate;
  },
}));

vi.mock("../config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env")>();
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const audioTmpDir = await mkdtemp(join(tmpdir(), "t22-audio-"));
  return { ...actual, env: { ...actual.env, AUDIO_TMP_DIR: audioTmpDir } };
});

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Actor = keyof Fixtures["actors"];
type TestApp = Awaited<ReturnType<typeof startAuthorizationApp>>;
type Checks = Parameters<TestApp["request"]>[2];
type Reply = Awaited<ReturnType<TestApp["request"]>>;

let fixtures: Fixtures;
let app: TestApp;
let exercise: number;
let writing: number;
let speaking: number;
let assignmentA: number;
let assignmentB: number;
let writingB: number;
let speakingB: number;
let attemptA: number;
let attemptB: number;
let pendingB: number;

const dueAt = new Date(Date.now() + 3_600_000);
const solution = `t22-correct-${randomUUID()}`;
const explanation = `t22-feedback-${randomUUID()}`;
const essay = { text: "I usually go to school by bus." };
const answerChecks = { forbiddenKeys: ["answer"] };
const beforeDue = {
  forbiddenKeys: ["answer", "explanation", "correction"],
  forbiddenValues: [solution, explanation],
};
const originalFile = "t22-original-upload.webm";

async function seedExercise(input: Pick<Prisma.ExerciseUncheckedCreateInput, "type" | "skill" | "content" | "answer">) {
  const row = await prisma.exercise.create({
    data: {
      ...input, topic: "T22 submission", level: "A1", source: "TEACHER", status: "PUBLISHED",
      inLibrary: true, createdById: fixtures.actors.teacherA.id, explanation,
    },
    select: { id: true },
  });
  return row.id;
}

async function seedAssignment(exerciseId: number, classroom: "classA" | "classB") {
  const { id: classId, teacherId: assignedById } = fixtures.classes[classroom];
  const row = await prisma.assignment.create({
    data: { exerciseId, classId, assignedById, dueAt },
    select: { id: true },
  });
  return row.id;
}

async function seedAttempt(exerciseId: number, assignmentId: number, student: "studentA" | "studentB",
  answer: Prisma.InputJsonValue, score: number | null) {
  const row = await prisma.attempt.create({
    data: { studentId: fixtures.actors[student].id, exerciseId, assignmentId, answer, score },
    select: { id: true },
  });
  return row.id;
}

beforeAll(async () => {
  fixtures = await createAuthorizationFixtures();
  [exercise, writing, speaking] = await Promise.all([
    seedExercise({ type: "fill_blank", skill: "FOUNDATION", content: { text: "She ___ today." }, answer: [solution] }),
    seedExercise({ type: "writing", skill: "WRITING", content: { prompt: "Describe your day.", minWords: 1 } }),
    seedExercise({ type: "speaking", skill: "SPEAKING", content: { prompt: "Describe your day." } }),
  ]);
  [assignmentA, assignmentB, writingB, speakingB] = await Promise.all([
    seedAssignment(exercise, "classA"),
    seedAssignment(exercise, "classB"),
    seedAssignment(writing, "classB"),
    seedAssignment(speaking, "classB"),
  ]);
  [attemptA, attemptB, pendingB] = await Promise.all([
    seedAttempt(exercise, assignmentA, "studentA", ["wrong"], 0),
    seedAttempt(exercise, assignmentB, "studentB", ["wrong"], 0),
    seedAttempt(writing, writingB, "studentB", essay, null),
  ]);
  app = await startAuthorizationApp(fixtures.forbiddenValues);
});

afterAll(async () => {
  try {
    await app?.close();
  } finally {
    try {
      if (fixtures) {
        const userIds = Object.values(fixtures.actors).map(({ id }) => id);
        const classIds = Object.values(fixtures.classes).map(({ id }) => id);
        await prisma.$transaction([
          prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.aiUsageLog.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } }),
          prisma.assignment.deleteMany({ where: { classId: { in: classIds } } }),
          prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } }),
        ]);
        await fixtures.cleanup();
      }
    } finally {
      await prisma.$disconnect();
      await rm(env.AUDIO_TMP_DIR, { recursive: true, force: true });
    }
  }
});

function send(path: string, method: string, auth?: HeadersInit, body?: object, checks?: Checks) {
  const headers = new Headers(auth);
  if (body) headers.set("Content-Type", "application/json");
  return app.request(path, { method, headers, body: body && JSON.stringify(body) }, checks);
}

function call(actor: Actor, path: string, method = "GET", body?: object, checks?: Checks) {
  return send(path, method, authorizationHeaders(fixtures.actors[actor]), body, checks);
}

function expectError(response: Reply, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({ data: null, error: { code } });
}

function upload(actor: Actor) {
  const bytes = new Uint8Array(64).fill(0x11);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  const form = new FormData();
  form.append("audio", new Blob([bytes], { type: "audio/webm" }), originalFile);
  return app.request(`/attempts/audio?assignmentId=${speakingB}`, {
    method: "POST",
    headers: authorizationHeaders(fixtures.actors[actor]),
    body: form,
  }, { forbiddenValues: [originalFile, env.AUDIO_TMP_DIR] });
}

const hsOnly = ["teacherA", "admin"] as const;
const routes = [
  ["GET", "/assignments", []],
  ["POST", "/assignments", ["studentA"]],
  ["GET", "/assignments/:assignmentId", hsOnly],
  ["GET", "/assignments/:assignmentId/submissions", ["studentA"]],
  ["POST", "/attempts", hsOnly],
  ["POST", "/attempts/audio", hsOnly],
  ["GET", "/attempts", hsOnly],
  ["GET", "/attempts/:attemptId", hsOnly],
  ["POST", "/attempts/:pendingId/regrade", hsOnly],
  ["PATCH", "/attempts/:attemptId/grade", ["studentA"]],
  ["POST", "/attempts/:attemptId/comment-suggestion", ["studentA"]],
] satisfies [string, string, readonly Actor[]][];

describe.each(routes)("%s %s", (method, path, denied) => {
  const url = () => path.replace(":assignmentId", String(assignmentA))
    .replace(":attemptId", String(attemptA)).replace(":pendingId", String(pendingB));

  it("thiếu token → 401", async () => {
    expectError(await send(url(), method), 401, "UNAUTHORIZED");
  });

  it("token hỏng → 401", async () => {
    expectError(await send(url(), method, { Authorization: "Bearer invalid-jwt" }), 401, "INVALID_TOKEN");
  });

  it("token hết hạn → 401", async () => {
    const headers = authorizationHeaders(fixtures.actors.studentA, -60);
    expectError(await send(url(), method, headers), 401, "INVALID_TOKEN");
  });

  const forbidden: readonly Actor[] = ["pendingTeacher", "lockedTeacher", ...denied];
  it.each(forbidden)("%s → 403", async (actor) => {
    expectError(await call(actor, url(), method), 403, "FORBIDDEN");
  });
});

describe("phạm vi lớp và bài nộp", () => {
  it.each(["teacherA", "studentA"] as const)("%s chỉ được xem danh sách bài của lớp A", async (actor) => {
    const own = await call(actor, `/assignments?classId=${fixtures.classes.classA.id}`, "GET", undefined, beforeDue);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ data: { items: [expect.objectContaining({ assignmentId: assignmentA })] } });
    const outside = await call(actor, `/assignments?classId=${fixtures.classes.classB.id}`);
    expect(outside.status).toBe(200);
    expect(outside.body).toMatchObject({ data: { items: [], total: 0 } });
  });

  it("GV A giao được bài cho lớp A, lớp B trả 404", async () => {
    const body = { exerciseId: exercise, dueAt: dueAt.toISOString() };
    const outside = await call("teacherA", "/assignments", "POST", { ...body, classId: fixtures.classes.classB.id });
    expectError(outside, 404, "NOT_FOUND");
    const own = await call("teacherA", "/assignments", "POST", { ...body, classId: fixtures.classes.classA.id });
    expect(own.status).toBe(201);
    expect(own.body).toMatchObject({ data: { assignedById: fixtures.actors.teacherA.id } });
  });

  it("admin giao bài và xem danh sách, bài nộp ở cả hai lớp", async () => {
    for (const [classroom, assignmentId] of [["classA", assignmentA], ["classB", assignmentB]] as const) {
      const classId = fixtures.classes[classroom].id;
      const created = await call("admin", "/assignments", "POST", { classId, exerciseId: exercise, dueAt: dueAt.toISOString() });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ data: { classId, assignedById: fixtures.actors.admin.id } });
      const list = await call("admin", `/assignments?classId=${classId}`);
      expect(list.status).toBe(200);
      expect(list.body).toMatchObject({ data: { items: expect.arrayContaining([expect.objectContaining({ assignmentId })]) } });
      expect((await call("admin", `/assignments/${assignmentId}/submissions`)).status).toBe(200);
    }
  });

  it("GV chỉ xem bài nộp và sửa điểm lớp của mình, admin sửa điểm lớp B", async () => {
    expect((await call("teacherA", `/assignments/${assignmentA}/submissions`)).status).toBe(200);
    expectError(await call("teacherA", `/assignments/${assignmentB}/submissions`), 404, "NOT_FOUND");
    expectError(await call("teacherA", `/attempts/${attemptB}/grade`, "PATCH", { teacher_score: 7 }), 404, "NOT_FOUND");
    expect((await call("teacherA", `/attempts/${attemptA}/grade`, "PATCH", { teacher_score: 8 })).status).toBe(200);
    expect((await call("admin", `/attempts/${attemptB}/grade`, "PATCH", { teacher_score: 9 })).status).toBe(200);
  });

  it("HS A không thấy bài giao và bài nộp của HS B", async () => {
    expectError(await call("studentA", `/assignments/${assignmentB}`), 404, "NOT_FOUND");
    expectError(await call("studentA", `/attempts/${attemptB}`, "GET", undefined, answerChecks), 404, "NOT_FOUND");
    const list = await call("studentA", `/attempts?assignmentId=${assignmentB}`, "GET", undefined, beforeDue);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ data: { items: [], total: 0 } });
    const own = await call("studentA", `/attempts/${attemptA}`, "GET", undefined, answerChecks);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ data: { attemptId: attemptA, submittedAnswer: ["wrong"] } });
  });
});

it("upload sai lớp hoặc sai vai trò bị chặn trước khi Multer ghi file", async () => {
  const write = vi.spyOn(fs, "createWriteStream");
  try {
    expectError(await upload("teacherA"), 403, "FORBIDDEN");
    expectError(await upload("studentA"), 404, "NOT_FOUND");
    expect(write).not.toHaveBeenCalled();
    expect(await readdir(env.AUDIO_TMP_DIR)).toEqual([]);

    const accepted = await upload("studentB");
    expect(accepted.status).toBe(201);
    expect(accepted.body).toMatchObject({ data: { audio_id: expect.any(String) } });
    expect(write).toHaveBeenCalledTimes(1);
    expect(await readdir(env.AUDIO_TMP_DIR)).toHaveLength(1);
  } finally {
    write.mockRestore();
  }
});

it("chặn nộp bài và chấm lại ngoài phạm vi trước khi gọi AI", async () => {
  fakeGenerate.mockReset();
  expectError(await call("teacherA", "/attempts", "POST", { assignmentId: writingB, answer: essay }), 403, "FORBIDDEN");
  expectError(await call("studentA", "/attempts", "POST", { assignmentId: writingB, answer: essay }), 404, "NOT_FOUND");
  expectError(await call("studentA", `/attempts/${pendingB}/regrade`, "POST"), 404, "NOT_FOUND");
  expect(fakeGenerate).not.toHaveBeenCalled();

  fakeGenerate.mockResolvedValueOnce({
    model: "t22-fake",
    text: JSON.stringify({ criteria: { content: 8, coherence: 8, vocabulary: 8, grammar: 8 }, comment: "Bài viết tốt.", errors: [] }),
  });
  const regrade = await call("studentB", `/attempts/${pendingB}/regrade`, "POST", undefined, beforeDue);
  expect(regrade.status).toBe(200);
  expect(regrade.body).toMatchObject({ data: { attemptId: pendingB, score: 8 } });
  expect(fakeGenerate).toHaveBeenCalledTimes(1);
});

it("HS chỉ thấy giải thích và bản sửa sau hạn, chính xác tại các mốc −1s, đúng hạn và +1s", async () => {
  const assignmentId = await seedAssignment(exercise, "classA");
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    for (const offset of [-1000, 0, 1000]) {
      vi.setSystemTime(dueAt.getTime() + offset);
      const checks = offset > 0 ? answerChecks : beforeDue;
      const post = await call("studentA", "/attempts", "POST", { assignmentId, answer: ["wrong"] }, checks);
      expect(post.status).toBe(201);
      const { data: { attemptId } } = post.body as { data: { attemptId: number } };
      const detail = await call("studentA", `/attempts/${attemptId}`, "GET", undefined, checks);
      const assignment = await call("studentA", `/assignments/${assignmentId}`, "GET", undefined, checks);
      expect(detail.status).toBe(200);
      expect(assignment.status).toBe(200);
      expect(detail.body).toMatchObject({ data: { isLate: offset > 0, submittedAnswer: ["wrong"] } });
      if (offset > 0) {
        const feedback = { explanation, errors: [expect.objectContaining({ correction: solution })] };
        expect(post.body).toMatchObject({ data: feedback });
        expect(detail.body).toMatchObject({ data: feedback });
        expect(assignment.body).toMatchObject({ data: { exercise: { explanation } } });
      }
    }
  } finally {
    vi.useRealTimers();
  }
});

it("bài tự luyện trả giải thích và bản sửa ngay, lịch sử danh sách chỉ trả tóm tắt", async () => {
  const exerciseId = await seedExercise({
    type: "fill_blank", skill: "FOUNDATION", content: { text: "She ___ today." }, answer: [solution],
  });
  const post = await call("studentA", "/attempts", "POST", { exerciseId, answer: ["wrong"] }, answerChecks);
  expect(post.status).toBe(201);
  expect(post.body).toMatchObject({ data: { explanation, errors: [expect.objectContaining({ correction: solution })] } });
  const list = await call("studentA", `/attempts?exerciseId=${exerciseId}&mode=practice`, "GET", undefined, beforeDue);
  expect(list.status).toBe(200);
  expect(list.body).toMatchObject({ data: { total: 1 } });
});