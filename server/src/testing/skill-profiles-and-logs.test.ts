import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { expectNoLeaks } from "./authorization-leaks";
import {
  authorizationHeaders,
  createAuthorizationFixtures,
  startAuthorizationApp,
} from "./authorization-fixtures";

const fake = vi.hoisted(() => ({
  generate: vi.fn(),
  apiKey: "t22-gemini-log-canary",
  healthError: undefined as Error | undefined,
  quotaError: undefined as Error | undefined,
}));
vi.mock("../config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env")>();
  return { ...actual, env: { ...actual.env, GEMINI_API_KEY: fake.apiKey } };
});
vi.mock("../ai/gemini.provider", () => ({
  GeminiProvider: class {
    readonly name = "t22-fake";
    generate = fake.generate;
  },
}));
vi.mock("../config/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/prisma")>();
  return {
    ...actual,
    prisma: new Proxy(actual.prisma, {
      get(target, key) {
        if (key === "$queryRaw" && fake.healthError) {
          return () => Promise.reject(fake.healthError);
        }
        if (key === "aiUsageLog" && fake.quotaError) {
          return new Proxy(target.aiUsageLog, {
            get(delegate, operation) {
              if (operation === "count") return () => Promise.reject(fake.quotaError);
              return Reflect.get(delegate, operation, delegate);
            },
          });
        }
        return Reflect.get(target, key, target);
      },
    }),
  };
});

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type TestApp = Awaited<ReturnType<typeof startAuthorizationApp>>;
type Actor = keyof Fixtures["actors"];

let fixtures: Fixtures;
let app: TestApp;
let exercises: Record<"writing" | "speaking", number>;
const essay = "I wrote this sample essay about a dog named T22-Essay-Canary.";
const transcript = "My sample recording tells the story of T22-Transcript-Canary.";
const prompt = "Describe your trip in detail and quote T22-Prompt-Canary.";

beforeAll(async () => {
  fixtures = await createAuthorizationFixtures();
  const seedExercise = async (type: "writing" | "speaking") => {
    const row = await prisma.exercise.create({
      data: {
        type, skill: type === "writing" ? "WRITING" : "SPEAKING", level: "A2",
        topic: "T22 private log fixtures", status: "PUBLISHED", inLibrary: true,
        source: "TEACHER", createdById: fixtures.actors.teacherA.id,
        content: type === "writing" ? { prompt, minWords: 1 } : { prompt },
      },
      select: { id: true },
    });
    return row.id;
  };
  exercises = { writing: await seedExercise("writing"), speaking: await seedExercise("speaking") };
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
          prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } }),
          prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } }),
        ]);
        await fixtures.cleanup();
      }
    } finally {
      await prisma.$disconnect();
    }
  }
});

function api(path: string, actor?: Actor, body?: unknown) {
  return app.request(path, actor || body !== undefined ? {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(actor ? authorizationHeaders(fixtures.actors[actor]) : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  } : undefined);
}

const endpoints = [
  ["/skill-profiles/me", ["teacherA", "admin"]],
  ["/skill-profiles/students/:id", ["studentA"]],
] satisfies [string, Actor[]][];

describe.each(endpoints)("GET %s", (path, denied) => {
  const url = () => path.replace(":id", String(fixtures.actors.studentB.id));

  it("thiếu token nhận 401", async () => {
    expect((await api(url())).status).toBe(401);
  });

  it("token hỏng và hết hạn nhận 401", async () => {
    for (const headers of [
      { Authorization: "Bearer invalid-jwt" },
      authorizationHeaders(fixtures.actors.studentA, -60),
    ]) {
      const reply = await app.request(url(), { headers });
      expect(reply.status).toBe(401);
      expect(reply.body).toMatchObject({ error: { code: "INVALID_TOKEN" } });
    }
  });

  const blocked: Actor[] = ["pendingTeacher", "lockedTeacher", ...denied];
  it.each(blocked)("%s nhận 403", async (actor) => {
    const reply = await api(url(), actor);
    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ data: null, error: { code: "FORBIDDEN" } });
  });
});

it("HS xem đúng hồ sơ bản thân, GV xem HS lớp mình, admin xem cả hai lớp", async () => {
  const { studentA, studentB } = fixtures.actors;
  const path = (id: number) => `/skill-profiles/students/${id}`;
  const own = await api(`/skill-profiles/me?studentId=${studentB.id}`, "studentA");
  expect(own.status).toBe(200);
  expect(own.body).toMatchObject({ data: { student: { id: studentA.id } } });
  const teacher = await api(path(studentA.id), "teacherA");
  expect(teacher).toEqual(own);
  const denied = await api(path(studentB.id), "teacherA");
  expect(denied.status).toBe(404);
  expect(denied.body).toMatchObject({ data: null, error: { code: "STUDENT_NOT_FOUND" } });
  expect(denied).toEqual(await api(path(2147483647), "teacherA"));
  for (const id of [studentA.id, studentB.id]) {
    const admin = await api(path(id), "admin");
    expect(admin.status).toBe(200);
    expect(admin.body).toMatchObject({ data: { student: { id } } });
  }
});

async function captureLogs(run: () => Promise<void>) {
  const consoleSpies = ["debug", "error", "info", "log", "warn"].map((name) =>
    vi.spyOn(console, name as "debug" | "error" | "info" | "log" | "warn").mockImplementation(() => {})
  );
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await run();
    const streams = [stdout, stderr].map((spy) => spy.mock.calls.map(([chunk]) =>
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString()
    ).join(""));
    return [...consoleSpies.flatMap((spy) => spy.mock.calls), ...streams];
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
    for (const spy of consoleSpies) spy.mockRestore();
  }
}

function logChecks() {
  return { forbiddenValues: [...fixtures.forbiddenValues, essay, transcript, prompt] };
}

it("lỗi JSON và lỗi health check không làm lộ dữ liệu trong log", async () => {
  const log = await captureLogs(async () => {
    const invalidJson = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"password":${JSON.stringify(fixtures.password)}`,
    });
    expect(invalidJson.status).toBe(500);

    fake.healthError = new Error(env.JWT_SECRET);
    try {
      expect((await api("/health/db")).status).toBe(503);
    } finally {
      fake.healthError = undefined;
    }
  });
  expectNoLeaks(log, logChecks());
  expect(log).toContainEqual(["INTERNAL_SERVER_ERROR"]);
  expect(log).toContainEqual(["DATABASE_UNAVAILABLE"]);
});

it("lỗi truy vấn thật chỉ ghi mã Prisma cố định", async () => {
  const log = await captureLogs(async () => {
    await expect(prisma.$queryRaw`SELECT CAST(${prompt} AS INTEGER)`).rejects.toThrow();
  });
  expectNoLeaks(log, logChecks());
  expect(log).toContainEqual(["[prisma] QUERY_ERROR"]);
});

it("mã lỗi bất thường ở quota không bị ghi ra log", async () => {
  fake.quotaError = Object.assign(
    new Error("Quota failed"), { code: env.GEMINI_API_KEY }
  );
  try {
    const log = await captureLogs(async () => {
      const reply = await api("/exercises/generate", "teacherA", {
        type: "multiple_choice", skill: "READING", level: "A2", count: 1, topic: "Log test",
      });
      expect(reply.status).toBe(503);
    });
    expectNoLeaks(log, logChecks());
    expect(log).toContainEqual(["[ai/rateLimit] check_failed task=generate code=UNKNOWN"]);
  } finally {
    fake.quotaError = undefined;
  }
});

it("AI lỗi định dạng không in bài viết, bản chữ hoặc prompt ra console và bảng log", async () => {
  fake.generate.mockReset();
  fake.generate.mockResolvedValue({ model: "t22-fake", text: `${essay} ${transcript} ${prompt} ${fake.apiKey}` });
  const log = await captureLogs(async () => {
    for (const [type, answer] of [
      ["writing", { text: essay }], ["speaking", { transcript }],
    ] as const) {
      const reply = await api("/attempts", "studentA", { exerciseId: exercises[type], answer });
      expect(reply.status).toBe(202);
      expectNoLeaks(reply.body, logChecks());
    }
  });
  expect(fake.generate).toHaveBeenCalledTimes(4);
  expectNoLeaks(log, logChecks());
  expect(JSON.stringify(log)).toContain("AI_INVALID_FORMAT");

  const rows = await prisma.aiUsageLog.findMany({ where: { userId: fixtures.actors.studentA.id } });
  expect(rows).toHaveLength(2);
  expect(rows.map(({ task, status }) => ({ task, status }))).toEqual(expect.arrayContaining([
    { task: "grade_writing", status: "error" },
    { task: "grade_speaking", status: "error" },
  ]));
  expectNoLeaks(rows, logChecks());
});

it("cấu hình không hợp lệ chỉ ghi nhãn đã che cho khóa ký token", async () => {
  const badSecret = "t22-jwt-short";
  vi.stubEnv("JWT_SECRET", badSecret);
  vi.resetModules();
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("TEST_EXIT");
  });
  try {
    const log = await captureLogs(async () => {
      await expect(vi.importActual("../config/env")).rejects.toThrow("TEST_EXIT");
    });
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expectNoLeaks(log, { forbiddenValues: [badSecret] });
    expect(log).toContainEqual(["Invalid environment variables", ["private configuration"]]);
  } finally {
    exit.mockRestore();
    vi.unstubAllEnvs();
  }
});
