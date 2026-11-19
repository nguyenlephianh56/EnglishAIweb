import { randomUUID } from "node:crypto";
import { ExerciseSource, ExerciseStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../config/prisma";
import { authorizationHeaders, createAuthorizationFixtures, startAuthorizationApp } from "./authorization-fixtures";

const fakeGenerate = vi.hoisted(() => vi.fn());
vi.mock("../ai/gemini.provider", () => ({
  GeminiProvider: class {
    readonly name = "t22-fake";
    generate = fakeGenerate;
  },
}));

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Actor = keyof Fixtures["actors"];
type TestApp = Awaited<ReturnType<typeof startAuthorizationApp>>;
type Checks = Parameters<TestApp["request"]>[2];

let fixtures: Fixtures;
let app: TestApp;
let draftA: number;
let draftB: number;
let libraryB: number;

const topic = `T22 exercises ${randomUUID()}`;
const answer = `answer-${randomUUID()}`;
const explanation = `explanation-${randomUUID()}`;
const exerciseBody = {
  type: "fill_blank",
  skill: "FOUNDATION",
  level: "A1",
  topic: `T22 writes ${randomUUID()}`,
  content: { text: "She ___ to school." },
  answer: ["goes"],
};
const generateBody = { type: "multiple_choice", skill: "READING", level: "A1", topic: exerciseBody.topic, count: 1 };
const studentChecks: Checks = {
  forbiddenKeys: ["answer", "explanation"],
  forbiddenValues: [answer, explanation],
};

async function seedExercise(teacher: Actor, status: ExerciseStatus, seedTopic = exerciseBody.topic) {
  const exercise = await prisma.exercise.create({
    data: {
      ...exerciseBody,
      skill: "FOUNDATION",
      level: "A1",
      topic: seedTopic,
      answer: [answer],
      explanation,
      source: ExerciseSource.TEACHER,
      status,
      inLibrary: status === ExerciseStatus.PUBLISHED,
      createdById: fixtures.actors[teacher].id,
    },
    select: { id: true },
  });
  return exercise.id;
}

beforeAll(async () => {
  fixtures = await createAuthorizationFixtures();
  [draftA, draftB, libraryB] = await Promise.all([
    seedExercise("teacherA", ExerciseStatus.DRAFT, topic),
    seedExercise("teacherB", ExerciseStatus.DRAFT, topic),
    seedExercise("teacherB", ExerciseStatus.PUBLISHED, topic),
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
        await prisma.$transaction([
          prisma.aiUsageLog.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } }),
        ]);
        await fixtures.cleanup();
      }
    } finally {
      await prisma.$disconnect();
    }
  }
});

beforeEach(() => fakeGenerate.mockReset());

function send(path: string, method: string, headers?: HeadersInit, body?: object, checks?: Checks) {
  const requestHeaders = new Headers(headers);
  if (body) requestHeaders.set("Content-Type", "application/json");
  return app.request(path, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  }, checks);
}

function asActor(actor: Actor, path: string, method = "GET", body?: object, checks?: Checks) {
  return send(path, method, authorizationHeaders(fixtures.actors[actor]), body, checks);
}

function expectError(response: { status: number; body: unknown }, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({ data: null, error: { code } });
}

const routes = [
  ["GET", "/exercises", [], undefined],
  ["GET", "/exercises/:id", [], undefined],
  ["POST", "/exercises", ["studentA"], exerciseBody],
  ["POST", "/exercises/generate", ["studentA"], generateBody],
  ["PATCH", "/exercises/:id", ["studentA"], { topic: "Updated topic" }],
  ["DELETE", "/exercises/:id", ["studentA"], undefined],
  ["POST", "/exercises/:id/propose", ["studentA", "admin"], undefined],
  ["POST", "/exercises/:id/approve", ["studentA", "teacherA"], undefined],
  ["POST", "/exercises/:id/reject", ["studentA", "teacherA"], { reason: "T22 review" }],
] satisfies [string, string, readonly Actor[], object | undefined][];

describe.each(routes)("%s %s", (method, path, denied, body) => {
  const url = () => path.replace(":id", String(draftB));
  afterEach(() => expect(fakeGenerate).not.toHaveBeenCalled());

  it("thiếu token → 401", async () => {
    expectError(await send(url(), method, undefined, body), 401, "UNAUTHORIZED");
  });

  it("token hỏng → 401", async () => {
    expectError(await send(url(), method, { Authorization: "Bearer invalid-jwt" }, body), 401, "INVALID_TOKEN");
  });

  it("token hết hạn → 401", async () => {
    const headers = authorizationHeaders(fixtures.actors.teacherA, -60);
    expectError(await send(url(), method, headers, body), 401, "INVALID_TOKEN");
  });

  it.each(["pendingTeacher", "lockedTeacher"] as const)("%s → 403", async (actor) => {
    expectError(await asActor(actor, url(), method, body), 403, "FORBIDDEN");
  });

  for (const actor of denied) {
    it(`${actor} sai vai trò → 403`, async () => {
      expectError(await asActor(actor, url(), method, body), 403, "FORBIDDEN");
    });
  }
});

describe("phạm vi xem bài tập", () => {
  it("HS chỉ thấy thư viện và response không chứa đáp án hay giải thích", async () => {
    const list = await asActor("studentA", `/exercises?topic=${encodeURIComponent(topic)}`, "GET", undefined, studentChecks);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ data: { items: [{ id: libraryB }], total: 1 } });

    const detail = await asActor("studentB", `/exercises/${libraryB}`, "GET", undefined, studentChecks);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ data: { id: libraryB } });
    expectError(await asActor("studentA", `/exercises/${draftB}`, "GET", undefined, studentChecks), 404, "NOT_FOUND");
  });

  it("GV thấy bài mình và thư viện, admin thấy mọi bài", async () => {
    const query = `/exercises?topic=${encodeURIComponent(topic)}`;
    const teacher = await asActor("teacherA", query);
    expect(teacher.status).toBe(200);
    expect(teacher.body).toMatchObject({
      data: {
        items: expect.arrayContaining([draftA, libraryB].map((id) => expect.objectContaining({ id }))),
        total: 2,
      },
    });

    const admin = await asActor("admin", query);
    expect(admin.status).toBe(200);
    expect(admin.body).toMatchObject({ data: { total: 3 } });

    const own = await asActor("teacherA", `/exercises/${draftA}`);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ data: { id: draftA, answer: [answer], explanation } });

    const preview = await asActor("teacherA", `/exercises/${libraryB}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ data: { id: libraryB } });

    const foreignDraft = await asActor("admin", `/exercises/${draftB}`);
    expect(foreignDraft.status).toBe(200);
    expect(foreignDraft.body).toMatchObject({ data: { id: draftB } });
  });

  it.each([
    ["GET", "", undefined],
    ["PATCH", "", { topic: "Unauthorized update" }],
    ["DELETE", "", undefined],
    ["POST", "/propose", undefined],
  ] as const)("GV A gọi %s trên nháp của GV B → 404", async (method, suffix, body) => {
    const denied = await asActor("teacherA", `/exercises/${draftB}${suffix}`, method, body);
    expectError(denied, 404, "NOT_FOUND");
    expect(denied).toEqual(await asActor("teacherA", `/exercises/2147483647${suffix}`, method, body));
    expect(await prisma.exercise.findUnique({ where: { id: draftB }, select: { status: true, topic: true } }))
      .toEqual({ status: ExerciseStatus.DRAFT, topic });
  });
});

describe("quyền tạo, sửa và kiểm duyệt", () => {
  it.each([
    ["teacherA", "DRAFT", false],
    ["admin", "PUBLISHED", true],
  ] as const)("%s tạo bài với trạng thái %s", async (actor, status, inLibrary) => {
    const result = await asActor(actor, "/exercises", "POST", { ...exerciseBody, publish: true });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ data: { createdById: fixtures.actors[actor].id, status, inLibrary } });
  });

  it.each([["teacherA", "teacherA"], ["admin", "teacherB"]] as const)("%s được sửa nháp", async (actor, owner) => {
    const id = await seedExercise(owner, ExerciseStatus.DRAFT);
    const changedTopic = `${exerciseBody.topic} edited`;
    const result = await asActor(actor, `/exercises/${id}`, "PATCH", { topic: changedTopic });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: { id, topic: changedTopic } });
  });

  it("GV đề xuất nháp của mình, admin duyệt và công bố vào thư viện", async () => {
    const id = await seedExercise("teacherA", ExerciseStatus.DRAFT);
    const path = `/exercises/${id}`;
    const proposed = await asActor("teacherA", `${path}/propose`, "POST");
    expect(proposed.status).toBe(200);
    expect(proposed.body).toMatchObject({ data: { id, status: "PROPOSED", inLibrary: false } });
    const approved = await asActor("admin", `${path}/approve`, "POST");
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ data: { id, status: "PUBLISHED", inLibrary: true } });
  });

  it("admin từ chối đề xuất và trả về nháp", async () => {
    const id = await seedExercise("teacherB", ExerciseStatus.PROPOSED);
    const result = await asActor("admin", `/exercises/${id}/reject`, "POST", { reason: "T22 review" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: { id, status: "DRAFT", inLibrary: false } });
  });

  it.each([["teacherA", "teacherA"], ["admin", "teacherB"]] as const)("%s được ẩn bài", async (actor, owner) => {
    const id = await seedExercise(owner, ExerciseStatus.PUBLISHED);
    const result = await asActor(actor, `/exercises/${id}`, "DELETE");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: { id, status: "HIDDEN", inLibrary: false } });
  });
});

describe("provider sinh bài", () => {
  it("request bị từ chối không gọi provider và không ghi lượt AI", async () => {
    const users = ["studentA", "pendingTeacher", "lockedTeacher"] as const;
    for (const actor of users) {
      expectError(await asActor(actor, "/exercises/generate", "POST", generateBody), 403, "FORBIDDEN");
    }
    expect(fakeGenerate).not.toHaveBeenCalled();
    expect(await prisma.aiUsageLog.count({ where: {
      task: "generate",
      userId: { in: users.map((actor) => fixtures.actors[actor].id) },
    } })).toBe(0);
  });

  it.each(["teacherA", "admin"] as const)("%s gọi provider giả một lần và lưu nháp", async (actor) => {
    fakeGenerate.mockResolvedValueOnce({
      model: "t22-fake",
      text: JSON.stringify({
        type: "multiple_choice",
        skill: "READING",
        level: "A1",
        topic: generateBody.topic,
        content: { questions: [{ q: "Where does she go?", options: ["School", "Home"] }] },
        answer: [0],
        explanation: "T22 fake model feedback",
      }),
    });
    const result = await asActor(actor, "/exercises/generate", "POST", generateBody);
    expect(result.status).toBe(201);
    expect(fakeGenerate).toHaveBeenCalledTimes(1);
    expect(result.body).toMatchObject({ data: {
      createdById: fixtures.actors[actor].id,
      status: "DRAFT",
      source: "AI",
      inLibrary: false,
    } });
  });
});