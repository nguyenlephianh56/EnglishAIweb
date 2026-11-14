import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { Role, UserStatus } from "@prisma/client";

const fake = vi.hoisted(() => ({
  jwtSecret: "generate-test-only-secret",
  findUser: vi.fn(),
  createExercise: vi.fn(),
  runAiTask: vi.fn(),
  quotaCheck: vi.fn(),
  usageLog: vi.fn(),
  exhausted: false,
  getExercise: vi.fn(),
}));

vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: fake.jwtSecret,
    AI_DAILY_LIMIT_STUDENT: 10,
    AI_DAILY_LIMIT_TEACHER: 50,
  },
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: { findUnique: fake.findUser },
    exercise: { create: fake.createExercise },
  },
}));

vi.mock("../../ai/ai.service", () => ({
  runAiTask: fake.runAiTask,
}));

vi.mock("../../ai/gemini.provider", () => {
  throw new Error("Test generate không được nạp provider thật");
});

// Middleware quota chạy thật; chỉ giả bộ đếm và bộ ghi log.
vi.mock("../../middlewares/aiRateLimit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../middlewares/aiRateLimit")>();

  return {
    ...actual,
    aiRateLimit: (task: Parameters<typeof actual.aiRateLimit>[0]) =>
      actual.aiRateLimit(task, {
        counter: { countUsedToday: fake.quotaCheck },
        logger: { log: fake.usageLog },
      }),
  };
});

// Không kéo service CRUD/DB thật vào test dành riêng cho generate.
vi.mock("./exercises.controller", () => ({
  createExercise: vi.fn(),
  getExercise: fake.getExercise,
  updateExercise: vi.fn(),
  deleteExercise: vi.fn(),
  proposeExercise: vi.fn(),
  approveExercise: vi.fn(),
  rejectExercise: vi.fn(),
}));

import { exerciseRoutes } from "./exercises.routes";
import { errorHandler } from "../../middlewares/errorHandler";
import * as generateService from "./exercises.generate.service";

const users: Record<
  number,
  { id: number; role: Role; status: UserStatus }
> = {
  1: { id: 1, role: Role.STUDENT, status: UserStatus.ACTIVE },
  2: { id: 2, role: Role.TEACHER, status: UserStatus.PENDING },
  3: { id: 3, role: Role.TEACHER, status: UserStatus.LOCKED },
  4: { id: 4, role: Role.TEACHER, status: UserStatus.ACTIVE },
  5: { id: 5, role: Role.ADMIN, status: UserStatus.ACTIVE },
};

// Bài trả về giả (service đã được mock trong file này).
const createdExercise = {
  id: 101,
  type: "multiple_choice",
  skill: "READING",
  level: "A1",
  topic: "Daily routines",
  content: { questions: [{ q: "Q?", options: ["a", "b"] }] },
  answer: [0],
  explanation: "Giải thích mẫu",
  status: "DRAFT",
  source: "AI",
  inLibrary: false,
  createdById: 4,
  createdAt: "2026-11-14T00:00:00.000Z",
  updatedAt: "2026-11-14T00:00:00.000Z",
};

const validBody = (overrides: Record<string, unknown> = {}) => ({
  skill: "READING",
  level: "A1",
  topic: "Daily routines",
  type: "multiple_choice",
  count: 3,
  ...overrides,
});

let server: Server | undefined;
let baseUrl = "";

beforeAll(async () => {
  const app = express();

  app.use(express.json());
  app.use("/api/v1/exercises", exerciseRoutes);
  app.use(errorHandler);

  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });

  const address = server?.address();

  if (!address || typeof address === "string") {
    throw new Error("Không mở được server test");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.exhausted = false;

  fake.quotaCheck.mockImplementation(
    async () => fake.exhausted ? 50 : 0
  );

  fake.usageLog.mockResolvedValue(undefined);

  fake.findUser.mockImplementation(
    async ({ where }: { where: { id: number } }) =>
      users[where.id] ?? null
  );
    // Mặc định service trả bài giả; test nào cần lỗi thì tự mockRejectedValueOnce.
  vi.spyOn(generateService, "generateExercise").mockResolvedValue(
    createdExercise as never
  );
});

afterEach(() => {
  expect(fake.createExercise).not.toHaveBeenCalled();
  expect(fake.runAiTask).not.toHaveBeenCalled();
  expect(fake.getExercise).not.toHaveBeenCalled();

  vi.restoreAllMocks();
});

afterAll(async () => {
  if (server) {
    const activeServer = server;

    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

async function post(
  body: unknown,
  userId?: number,
  authorization?: string
) {
  const response = await fetch(
    `${baseUrl}/api/v1/exercises/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorization !== undefined
          ? { Authorization: authorization }
          : userId === undefined
            ? {}
            : {
                Authorization:
                  `Bearer ${jwt.sign({ userId }, fake.jwtSecret)}`,
              }),
      },
      body: JSON.stringify(body),
    }
  );

  const json = (await response.json()) as {
    data: unknown;
    error: { code: string; message: string } | null;
  };

  expect(Object.keys(json).sort()).toEqual(["data", "error"]);

  expect(JSON.stringify(json)).not.toMatch(
    /passwordHash|JWT_SECRET|GEMINI_API_KEY/
  );
  expect(JSON.stringify(json)).not.toContain(fake.jwtSecret);

  // Token của ACTIVE user do chính test ký.
  // Chỉ báo mã lỗi/số lượt gọi mock, không in token/secret.
  if (
    response.status === 401 &&
    userId !== undefined &&
    users[userId]?.status === UserStatus.ACTIVE
  ) {
    throw new Error(
      `AUTH_TEST_FAILURE code=${json.error?.code ?? "UNKNOWN"}` +
      ` userLookupCalls=${fake.findUser.mock.calls.length}` +
      ` quotaCalls=${fake.quotaCheck.mock.calls.length}`
    );
  }

  return { status: response.status, json };
}

describe("POST /api/v1/exercises/generate - nối route và stub", () => {
  it.each([
    ["không token", undefined, 401, "UNAUTHORIZED"],
    ["STUDENT", 1, 403, "FORBIDDEN"],
    ["TEACHER PENDING", 2, 401, "UNAUTHORIZED"],
    ["TEACHER LOCKED", 3, 401, "UNAUTHORIZED"],
  ] as const)(
    "%s bị chặn trước quota",
    async (_name, userId, status, code) => {
      const result = await post(validBody(), userId);

      expect(result.status).toBe(status);
      expect(result.json.data).toBeNull();
      expect(result.json.error?.code).toBe(code);

      // PENDING/LOCKED phải thực sự đi qua authenticate.
      expect(fake.findUser).toHaveBeenCalledTimes(
        userId === undefined ? 0 : 1
      );

      expect(fake.quotaCheck).not.toHaveBeenCalled();
      expect(fake.usageLog).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["TEACHER ACTIVE", 4],
    ["ADMIN", 5],
  ] as const)(
    "%s qua kiểm tra, nhận 201 và không ghi bài/gọi AI",
    async (_name, userId) => {
      const spy = vi.spyOn(generateService, "generateExercise");

      const result = await post(
        validBody({ topic: "  Daily routines  " }),
        userId
      );

      expect(result.status).toBe(201);
      expect(result.json).toEqual({ data: createdExercise, error: null });
      expect(fake.quotaCheck).toHaveBeenCalledExactlyOnceWith(
        userId,
        expect.any(Date)
      );

      expect(fake.usageLog).not.toHaveBeenCalled();
      expect(fake.findUser).toHaveBeenCalledTimes(1);

      expect(spy).toHaveBeenCalledExactlyOnceWith(
        users[userId],
        validBody()
      );

      for (const secret of [
        "passwordHash",
        "JWT_SECRET",
        "GEMINI_API_KEY",
        fake.jwtSecret,
      ]) {
        expect(JSON.stringify(result.json)).not.toContain(secret);
      }
    }
  );

  it("cặp skill/type sai trả 400 trước quota", async () => {
    const result = await post(
      validBody({ skill: "LISTENING" }),
      4
    );

    expect(result.status).toBe(400);
    expect(result.json.error?.code).toBe("VALIDATION_ERROR");
    expect(fake.quotaCheck).not.toHaveBeenCalled();
    expect(fake.usageLog).not.toHaveBeenCalled();
  });

  it.each([4, 5])(
    "user %i hết lượt trả 429 AI_QUOTA_EXCEEDED, chưa gọi service",
    async (userId) => {
      fake.exhausted = true;

      const spy = vi.spyOn(generateService, "generateExercise");
      const result = await post(validBody(), userId);

      expect(result.status).toBe(429);
      expect(result.json.data).toBeNull();
      expect(result.json.error?.code).toBe("AI_QUOTA_EXCEEDED");
      expect(fake.quotaCheck).toHaveBeenCalledOnce();

      expect(fake.usageLog).toHaveBeenCalledExactlyOnceWith({
        userId,
        task: "generate",
        status: "rate_limited",
        tokens: null,
      });

      expect(spy).not.toHaveBeenCalled();
    }
  );

  it("input sai vẫn trả 400 khi hết lượt và không vào middleware quota", async () => {
    fake.exhausted = true;

    const result = await post(validBody({ count: 0 }), 4);

    expect(result.status).toBe(400);
    expect(result.json.error?.code).toBe("VALIDATION_ERROR");
    expect(fake.quotaCheck).not.toHaveBeenCalled();
    expect(fake.usageLog).not.toHaveBeenCalled();
  });

  it("lỗi bất ngờ không lộ nội dung trong response hoặc log", async () => {
    const log = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    vi.spyOn(generateService, "generateExercise").mockRejectedValueOnce(
      new Error("PRIVATE_TOPIC GEMINI_API_KEY passwordHash")
    );

    const result = await post(validBody(), 4);

    expect(result.status).toBe(500);
    expect(result.json.error?.code).toBe("INTERNAL_SERVER_ERROR");

    expect(JSON.stringify(result.json)).not.toMatch(
      /PRIVATE_TOPIC|GEMINI_API_KEY|passwordHash/
    );

    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((log.mock.calls[0]?.[0] as Error).message).toBe(
      "EXERCISE_GENERATE_FAILED"
    );
  });
});

// Kiểm tra từng input sai khi đã hết quota để chứng minh validate chạy trước.
async function expectInvalid(body: unknown) {
  fake.exhausted = true;

  const result = await post(body, 4);

  expect(result.status).toBe(400);
  expect(result.json.error?.code).toBe("VALIDATION_ERROR");
  expect(fake.quotaCheck).not.toHaveBeenCalled();
  expect(fake.usageLog).not.toHaveBeenCalled();

  return result;
}

const validPairs = [
  ["multiple_choice", "READING"],
  ["fill_blank", "FOUNDATION"],
  ["fill_blank", "READING"],
  ["matching", "FOUNDATION"],
  ["error_correction", "WRITING"],
  ["error_correction", "FOUNDATION"],
  ["listening_fill", "LISTENING"],
  ["writing", "WRITING"],
  ["speaking", "SPEAKING"],
] as const;

describe("POST generate - ma trận đầu vào qua HTTP", () => {
  it.each(["skill", "level", "topic", "type", "count"])(
    "thiếu %s → 400",
    async (field) => {
      const body: Record<string, unknown> = validBody();
      delete body[field];

      await expectInvalid(body);
    }
  );

  it.each([
    ["skill", "COOKING"],
    ["level", "C2"],
    ["type", "essay"],
  ])("%s ngoài danh sách → 400", async (field, value) => {
    await expectInvalid(validBody({ [field]: value }));
  });

  it.each([0, -1, 1.5, "1", 11, null, true])(
    "count = %j → 400",
    async (count) => {
      await expectInvalid(validBody({ count }));
    }
  );

  it.each([1, 10])("count ở biên %i → 201", async (count) => {
    expect(
      (await post(validBody({ count }), 4)).status
    ).toBe(201);

    expect(fake.usageLog).not.toHaveBeenCalled();
  });

  it.each(["writing", "speaking", "error_correction"])(
    "%s chỉ nhận count = 1",
    async (type) => {
      const skill = type === "speaking" ? "SPEAKING" : "WRITING";

      for (const count of [2, 10]) {
        await expectInvalid(validBody({ type, skill, count }));
      }
    }
  );

  it("matching nhận 2–10 cặp, từ chối 1 và 11", async () => {
    const body = validBody({
      type: "matching",
      skill: "FOUNDATION",
    });

    await expectInvalid({ ...body, count: 1 });
    await expectInvalid({ ...body, count: 11 });

    fake.exhausted = false;

    for (const count of [2, 10]) {
      expect(
        (await post({ ...body, count }, 4)).status
      ).toBe(201);
    }

    expect(fake.usageLog).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "   ",
    "a",
    "a".repeat(101),
    "Daily\u0000topic",
    "Daily\u007Ftopic",
    "Daily\u009Ftopic",
    "\tDaily topic",
    "Daily topic\n",
    "\rDaily topic",
  ])("topic không hợp lệ %j → 400", async (topic) => {
    await expectInvalid(validBody({ topic }));
  });

  it("topic 100 ký tự, có khoảng trắng đầu/cuối → trim và nhận 201", async () => {
    const topic = "a".repeat(100);
    const spy = vi.spyOn(generateService, "generateExercise");

    expect(
      (await post(validBody({ topic: `  ${topic}  ` }), 4)).status
    ).toBe(201);

    expect(spy).toHaveBeenCalledExactlyOnceWith(
      users[4],
      validBody({ topic })
    );
  });

  it.each(["A1", "A2", "B1", "B2"])(
    "nhận level %s → 201",
    async (level) => {
      expect(
        (await post(validBody({ level }), 4)).status
      ).toBe(201);
    }
  );

  it.each(validPairs)(
    "nhận cặp %s + %s → 201",
    async (type, skill) => {
      const count = type === "matching" ? 2 : 1;

      expect(
        (await post(validBody({ type, skill, count }), 4)).status
      ).toBe(201);
    }
  );

  const skills = [
    "LISTENING",
    "SPEAKING",
    "READING",
    "WRITING",
    "FOUNDATION",
  ];

  const types = [...new Set(validPairs.map(([type]) => type))];

  const invalidPairs = types.flatMap((type) =>
    skills
      .filter(
        (skill) =>
          !validPairs.some(([t, s]) => t === type && s === skill)
      )
      .map((skill) => [type, skill])
  );

  it.each(invalidPairs)(
    "từ chối cặp %s + %s và nêu cặp hợp lệ",
    async (type, skill) => {
      const count = type === "matching" ? 2 : 1;

      const result = await expectInvalid(
        validBody({ type, skill, count })
      );

      expect(result.json.error?.message).toContain(type);

      for (const [, allowedSkill] of validPairs.filter(
        ([validType]) => validType === type
      )) {
        expect(result.json.error?.message).toContain(allowedSkill);
      }
    }
  );

  it.each([
    "status",
    "source",
    "in_library",
    "created_by_id",
    "inLibrary",
    "createdById",
  ])("client gửi field %s → 400", async (field) => {
    await expectInvalid(validBody({ [field]: "PRIVATE_VALUE" }));
  });

  it("token sai → 401, chưa truy vấn user hay kiểm tra quota", async () => {
    const result = await post(
      validBody(),
      undefined,
      "Bearer invalid-token"
    );

    expect(result.status).toBe(401);
    expect(result.json.error?.code).toBe("INVALID_TOKEN");
    expect(fake.findUser).not.toHaveBeenCalled();
    expect(fake.quotaCheck).not.toHaveBeenCalled();
    expect(fake.usageLog).not.toHaveBeenCalled();
  });

  it("49/50 lượt → 201; 50/50 lượt → 429, chỉ ghi log rate_limited", async () => {
    fake.quotaCheck
      .mockResolvedValueOnce(49)
      .mockResolvedValueOnce(50);

    expect((await post(validBody(), 4)).status).toBe(201);
    expect(fake.usageLog).not.toHaveBeenCalled();

    expect((await post(validBody(), 4)).status).toBe(429);
    expect(fake.usageLog).toHaveBeenCalledExactlyOnceWith({
      userId: 4,
      task: "generate",
      status: "rate_limited",
      tokens: null,
    });
  });

  it("không ghi topic hoặc nội dung người dùng vào console", async () => {
    const topic = "PRIVATE_TOPIC_DO_NOT_LOG";

    const spies = ["log", "info", "warn", "error"].map((method) =>
      vi
        .spyOn(console, method as "log" | "info" | "warn" | "error")
        .mockImplementation(() => {})
    );

    expect((await post(validBody({ topic }), 4)).status).toBe(201);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }

    expect(fake.usageLog).not.toHaveBeenCalled();
  });
});