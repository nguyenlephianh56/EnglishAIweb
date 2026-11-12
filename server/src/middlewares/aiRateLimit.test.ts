/**
 * Test middleware aiRateLimit (T9) trên app Express mini.
 *
 * - Không gọi AI thật, không cần DB/.env: Prisma và env được mock; DB log là DB giả có lọc
 *   where giống Prisma, và middleware dùng ĐÚNG hàm đếm/ghi log thật của ai.usage.ts
 *   (nên quy tắc "ngày VN, chỉ ok+error, mỗi user riêng" được kiểm bằng code thật).
 * - "Đăng nhập" giả: header x-test-auth = "id:ROLE" chỉ dùng trong test này, thay cho authenticate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";

vi.mock("../config/prisma", () => ({
  prisma: { aiUsageLog: { count: vi.fn(), create: vi.fn() } },
}));
vi.mock("../config/env", () => ({
  env: { AI_DAILY_LIMIT_STUDENT: 10, AI_DAILY_LIMIT_TEACHER: 50 },
}));

import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { InMemoryAiCache } from "../ai/ai.cache";
import { runAiTask } from "../ai/ai.service";
import type { AiServiceDeps } from "../ai/ai.service";
import { AIQuotaExceededError, AIUsageCheckError } from "../ai/ai.types";
import type { AiTask } from "../ai/ai.types";
import {
  countAiUsageToday,
  createPrismaUsageCounter,
  createPrismaUsageLogger,
} from "../ai/ai.usage";
import type { AiUsageDb } from "../ai/ai.usage";
import type { AIProvider } from "../ai/provider";
import { aiRateLimit } from "./aiRateLimit";
import type { AiRateLimitDeps } from "./aiRateLimit";
import { errorHandler } from "./errorHandler";

// 12:00 giờ VN ngày 12/11/2026. Đầu ngày VN = 2026-11-11T17:00:00Z.
const NOW = new Date("2026-11-12T05:00:00Z");
const TODAY_AT = new Date("2026-11-12T01:00:00Z"); // 08:00 VN, trong ngày 12/11
const QUOTA_MESSAGE = new AIQuotaExceededError().message;
const LEAK = /passwordHash|JWT_SECRET|GEMINI_API_KEY|Bearer|eyJ/;

type Row = {
  userId: number;
  task: string;
  status: string;
  tokens: number | null;
  createdAt: Date;
};

function makeDb(clock: () => Date) {
  const rows: Row[] = [];
  const api: AiUsageDb = {
    aiUsageLog: {
      async count({ where }) {
        return rows.filter(
          (r) =>
            r.userId === where.userId &&
            where.status.in.includes(r.status) &&
            r.createdAt >= where.createdAt.gte &&
            r.createdAt < where.createdAt.lt
        ).length;
      },
      async create({ data }) {
        rows.push({ ...data, createdAt: clock() });
        return data;
      },
    },
  };
  const seed = (userId: number, status: string, n: number, at: Date = TODAY_AT) => {
    for (let i = 0; i < n; i++) {
      rows.push({ userId, task: "grade_writing", status, tokens: null, createdAt: at });
    }
  };
  const byStatus = (status: string) => rows.filter((r) => r.status === status);
  return { rows, api, seed, byStatus };
}

let servers: Server[] = [];
let errSpy: ReturnType<typeof vi.spyOn>;
const logsText = () => errSpy.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");

beforeEach(() => {
  env.AI_DAILY_LIMIT_STUDENT = 10;
  env.AI_DAILY_LIMIT_TEACHER = 50;
  vi.mocked(prisma.aiUsageLog.count).mockReset();
  vi.mocked(prisma.aiUsageLog.create).mockReset();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  errSpy.mockRestore();
  await Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        })
    )
  );
  servers = [];
});

type Handler = (req: Request, res: Response, next: NextFunction) => void;

async function setup(
  options: {
    deps?: Partial<AiRateLimitDeps>;
    task?: AiTask;
    handler?: Handler;
    realDefaults?: boolean; // true = aiRateLimit(task) không truyền cổng nào (dùng Prisma mock)
  } = {}
) {
  let current = NOW;
  const clock = { now: () => current, set: (iso: string) => void (current = new Date(iso)) };
  const db = makeDb(clock.now);
  const counter = createPrismaUsageCounter(db.api);
  const logger = createPrismaUsageLogger(db.api);
  const countSpy = vi.spyOn(counter, "countUsedToday");
  const logSpy = vi.spyOn(logger, "log");

  const handler = vi.fn<Handler>(
    options.handler ??
      ((_req, res) => {
        res.json({ data: { ok: true }, error: null });
      })
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const raw = req.headers["x-test-auth"];
    if (typeof raw === "string") {
      const [id, role] = raw.split(":");
      req.user = { id: Number(id), role, status: "ACTIVE" } as unknown as Request["user"];
    }
    next();
  });
  const task = options.task ?? "grade_writing";
  const limiter = options.realDefaults
    ? aiRateLimit(task)
    : aiRateLimit(task, { counter, logger, now: clock.now, ...options.deps });
  app.post("/ai/test", limiter, handler);
  app.use(errorHandler);

  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call = async (
    auth?: string,
    init: { body?: unknown; query?: string; headers?: Record<string, string> } = {}
  ) => {
    const res = await fetch(`${baseUrl}/ai/test${init.query ?? ""}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { "x-test-auth": auth } : {}),
        ...(init.headers ?? {}),
      },
      body: JSON.stringify(init.body ?? {}),
    });
    const text = await res.text();
    return { status: res.status, text, json: JSON.parse(text) };
  };

  return { call, db, handler, countSpy, logSpy, clock };
}

// ---------------------------------------------------------------------
describe("aiRateLimit: còn lượt / hết lượt", () => {
  it("còn lượt (trần-1) -> qua, handler được gọi, middleware không ghi lượt", async () => {
    const t = await setup();
    t.db.seed(1, "ok", 9);
    const res = await t.call("1:STUDENT");
    expect(res.status).toBe(200);
    expect(t.handler).toHaveBeenCalledTimes(1);
    expect(t.db.rows).toHaveLength(9); // không thêm dòng nào
    expect(t.logSpy).not.toHaveBeenCalled();
  });

  it("đúng bằng trần -> 429 chuẩn, handler KHÔNG được gọi, message không lộ số liệu", async () => {
    const t = await setup();
    t.db.seed(1, "ok", 10);
    const res = await t.call("1:STUDENT");
    expect(res.status).toBe(429);
    expect(res.json).toEqual({
      data: null,
      error: { code: "AI_QUOTA_EXCEEDED", message: QUOTA_MESSAGE },
    });
    expect(res.json.error.message).not.toMatch(/\d/);
    expect(t.handler).not.toHaveBeenCalled();
  });

  it("sát biên + trần lấy từ .env: đổi giá trị thì đổi hành vi", async () => {
    env.AI_DAILY_LIMIT_STUDENT = 3;
    const t = await setup();
    t.db.seed(1, "ok", 2);
    expect((await t.call("1:STUDENT")).status).toBe(200); // trần-1 -> qua
    t.db.seed(1, "ok", 1);
    expect((await t.call("1:STUDENT")).status).toBe(429); // đúng trần -> chặn
    env.AI_DAILY_LIMIT_STUDENT = 4;
    expect((await t.call("1:STUDENT")).status).toBe(200); // nâng trần -> qua lại
  });

  it("mức theo vai trò giống service: STUDENT 10, TEACHER/ADMIN 50", async () => {
    const t = await setup();
    t.db.seed(1, "ok", 10);
    t.db.seed(2, "ok", 10);
    t.db.seed(3, "ok", 10);
    expect((await t.call("1:STUDENT")).status).toBe(429);
    expect((await t.call("2:TEACHER")).status).toBe(200);
    expect((await t.call("3:ADMIN")).status).toBe(200);
  });
});

// ---------------------------------------------------------------------
describe("aiRateLimit: xác thực + phân quyền theo user", () => {
  it("không có req.user -> 401, không chạm hàm đếm/log, handler không chạy", async () => {
    const t = await setup();
    const res = await t.call();
    expect(res.status).toBe(401);
    expect(res.json).toEqual({
      data: null,
      error: { code: "UNAUTHORIZED", message: "Vui lòng đăng nhập" },
    });
    expect(t.countSpy).not.toHaveBeenCalled();
    expect(t.logSpy).not.toHaveBeenCalled();
    expect(t.handler).not.toHaveBeenCalled();
  });

  it("user A hết lượt không chặn user B", async () => {
    const t = await setup();
    t.db.seed(1, "ok", 10);
    expect((await t.call("1:STUDENT")).status).toBe(429);
    expect((await t.call("2:STUDENT")).status).toBe(200);
  });

  it("userId giả trong body/query/header không có tác dụng", async () => {
    const t = await setup();
    t.db.seed(1, "ok", 10);
    const spoof = {
      body: { userId: 1 },
      query: "?userId=1",
      headers: { "x-user-id": "1" },
    };
    // B (chưa dùng lượt nào) giả làm A -> vẫn qua, và hàm đếm được gọi với id của B.
    expect((await t.call("2:STUDENT", spoof)).status).toBe(200);
    expect(t.countSpy).toHaveBeenLastCalledWith(2, expect.any(Date));
    // A (hết lượt) giả làm B -> vẫn bị chặn.
    const asA = await t.call("1:STUDENT", {
      body: { userId: 2 },
      query: "?userId=2",
      headers: { "x-user-id": "2" },
    });
    expect(asA.status).toBe(429);
    expect(t.countSpy).toHaveBeenLastCalledWith(1, expect.any(Date));
  });
});

// ---------------------------------------------------------------------
describe("aiRateLimit: quy tắc đếm (ngày VN, trạng thái)", () => {
  it("sang ngày mới (00:00 giờ VN) thì đếm lại", async () => {
    const t = await setup();
    // 17:00 VN ngày 11/11 (thuộc ngày VN 11/11).
    t.db.seed(1, "ok", 10, new Date("2026-11-11T10:00:00Z"));
    t.clock.set("2026-11-11T16:59:59.999Z"); // 23:59:59.999 VN ngày 11/11
    expect((await t.call("1:STUDENT")).status).toBe(429);
    t.clock.set("2026-11-11T17:00:00.000Z"); // đúng 00:00 VN ngày 12/11
    expect((await t.call("1:STUDENT")).status).toBe(200);
  });

  it("log cached/rate_limited không làm giảm lượt; log error vẫn tính", async () => {
    const t = await setup();
    t.db.seed(1, "ok", 9);
    t.db.seed(1, "cached", 20);
    t.db.seed(1, "rate_limited", 20);
    expect((await t.call("1:STUDENT")).status).toBe(200); // vẫn mới dùng 9

    t.db.seed(2, "error", 10);
    expect((await t.call("2:STUDENT")).status).toBe(429); // 10 lượt error = hết lượt

    t.db.seed(3, "cached", 30);
    t.db.seed(3, "rate_limited", 30);
    expect((await t.call("3:STUDENT")).status).toBe(200); // chỉ cached/rate_limited -> 0 lượt
  });

  it("dòng rate_limited do middleware ghi không làm tăng số lượt đã dùng", async () => {
    const t = await setup();
    t.db.seed(1, "ok", 10);
    await t.call("1:STUDENT");
    await t.call("1:STUDENT");
    expect(await countAiUsageToday(1, NOW, t.db.api)).toBe(10);
  });
});

// ---------------------------------------------------------------------
describe("aiRateLimit: ghi log khi chặn + không ghi trùng với ai.service.ts", () => {
  it("chặn xong ghi đúng 1 dòng rate_limited (đủ user/task, tokens null)", async () => {
    const t = await setup({ task: "generate" });
    t.db.seed(1, "ok", 10);
    await t.call("1:STUDENT");
    expect(t.logSpy).toHaveBeenCalledTimes(1);
    expect(t.db.rows).toHaveLength(11);
    expect(t.db.byStatus("rate_limited")).toEqual([
      expect.objectContaining({ userId: 1, task: "generate", status: "rate_limited", tokens: null }),
    ]);
  });

  describe("kết hợp với runAiTask thật (provider giả)", () => {
    const schema = z.object({ score: z.number(), comment: z.string() });

    function serviceFor(t: Awaited<ReturnType<typeof setup>>) {
      const generate = vi.fn(async () => ({
        text: JSON.stringify({ score: 7, comment: "Tốt" }),
        model: "mock-1",
        tokens: { input: 1, output: 1 },
      }));
      const provider: AIProvider = { name: "mock", generate };
      const deps: AiServiceDeps = {
        provider,
        cache: new InMemoryAiCache({ now: () => t.clock.now().getTime() }),
        counter: createPrismaUsageCounter(t.db.api),
        logger: createPrismaUsageLogger(t.db.api),
        limits: { student: 10, teacher: 50 },
        model: "mock-model",
        cacheableTasks: new Set<AiTask>(),
        now: t.clock.now,
      };
      return { generate, deps };
    }

    it("hết lượt: middleware chặn, service không chạy -> chỉ 1 dòng rate_limited, không gọi AI", async () => {
      const holder: { deps?: AiServiceDeps } = {};
      const t = await setup({
        handler: async (req, res, next) => {
          try {
            const r = await runAiTask(
              { userId: req.user!.id, role: req.user!.role, task: "grade_writing", prompt: "p", schema },
              holder.deps
            );
            res.json({ data: r.data, error: null });
          } catch (e) {
            next(e);
          }
        },
      });
      const { generate, deps } = serviceFor(t);
      holder.deps = deps;
      t.db.seed(1, "ok", 9);

      expect((await t.call("1:STUDENT")).status).toBe(200); // lượt thứ 10: service gọi AI + log ok
      expect(generate).toHaveBeenCalledTimes(1);
      expect(t.db.byStatus("ok")).toHaveLength(10);

      expect((await t.call("1:STUDENT")).status).toBe(429); // lượt 11: middleware chặn
      expect(generate).toHaveBeenCalledTimes(1); // AI không bị gọi thêm
      expect(t.db.byStatus("rate_limited")).toHaveLength(1); // chỉ middleware ghi, service không ghi trùng
      expect(t.db.byStatus("ok")).toHaveLength(10);
    });

    it("không hồi quy: chưa gắn middleware thì ai.service.ts vẫn tự chặn khi hết lượt", async () => {
      const t = await setup();
      const { generate, deps } = serviceFor(t);
      t.db.seed(1, "ok", 10);
      await expect(
        runAiTask({ userId: 1, role: "STUDENT", task: "grade_writing", prompt: "p", schema }, deps)
      ).rejects.toBeInstanceOf(AIQuotaExceededError);
      expect(generate).not.toHaveBeenCalled();
      expect(t.db.byStatus("rate_limited")).toHaveLength(1);
    });
  });

  it("ghi log lỗi khi chặn: vẫn trả 429, log không lộ chi tiết", async () => {
    const logger = { log: vi.fn().mockRejectedValue(new Error("db down SECRET_DETAIL")) };
    const t = await setup({ deps: { logger } });
    t.db.seed(1, "ok", 10);
    const res = await t.call("1:STUDENT");
    expect(res.status).toBe(429);
    expect(res.json.error.code).toBe("AI_QUOTA_EXCEEDED");
    expect(logsText()).not.toContain("SECRET_DETAIL");
  });
});

// ---------------------------------------------------------------------
describe("aiRateLimit: lỗi khi đếm -> chặn 503, không cho qua", () => {
  const dbError = () =>
    Object.assign(new Error("connect ECONNREFUSED postgres://user:pass@db:5432/englishai"), {
      code: "P1001",
    });

  it("lỗi DB khi đếm -> 503 chuẩn, không lộ chi tiết, handler không chạy, không ghi log", async () => {
    const counter = { countUsedToday: vi.fn().mockRejectedValue(dbError()) };
    const t = await setup({ deps: { counter } });
    const res = await t.call("1:STUDENT");
    expect(res.status).toBe(503);
    expect(res.json).toEqual({
      data: null,
      error: { code: "AI_USAGE_CHECK_FAILED", message: new AIUsageCheckError().message },
    });
    expect(res.text).not.toMatch(/ECONNREFUSED|postgres|pass|P1001/);
    expect(logsText()).not.toMatch(/ECONNREFUSED|postgres:\/\/|pass@/);
    expect(t.handler).not.toHaveBeenCalled();
    expect(t.logSpy).not.toHaveBeenCalled();
  });

  it("đọc cấu hình giới hạn bị lỗi -> cũng 503, không cho qua", async () => {
    const getLimits = vi.fn().mockRejectedValue(new Error("env hỏng"));
    const t = await setup({ deps: { getLimits } });
    const res = await t.call("1:STUDENT");
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe("AI_USAGE_CHECK_FAILED");
    expect(t.handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
describe("aiRateLimit: bảo mật + cổng mặc định", () => {
  it("response và log không chứa passwordHash/JWT_SECRET/GEMINI_API_KEY/token", async () => {
    const headers = { authorization: "Bearer eyJfake.token.value" };
    const texts: string[] = [];

    const blocked = await setup();
    blocked.db.seed(1, "ok", 10);
    texts.push((await blocked.call("1:STUDENT", { headers })).text);

    const anon = await setup();
    texts.push((await anon.call(undefined, { headers })).text);

    const broken = await setup({
      deps: { counter: { countUsedToday: vi.fn().mockRejectedValue(new Error("x")) } },
    });
    texts.push((await broken.call("1:STUDENT", { headers })).text);

    for (const text of texts) expect(text).not.toMatch(LEAK);
    expect(logsText()).not.toMatch(LEAK);
  });

  it("lỗi lạ từ route vẫn qua errorHandler thành 500 chung, không lộ chi tiết", async () => {
    const t = await setup({
      handler: (_req, _res, next) => next(new Error("chi tiết DB bí mật")),
    });
    const res = await t.call("1:STUDENT");
    expect(res.status).toBe(500);
    expect(res.json).toEqual({
      data: null,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Đã xảy ra lỗi từ máy chủ" },
    });
    expect(res.text).not.toContain("bí mật");
  });

  it("cổng mặc định: dùng đúng hàm đếm/ghi log Prisma (ok+error, theo userId) + trần từ env", async () => {
    const count = vi.mocked(prisma.aiUsageLog.count);
    const create = vi.mocked(prisma.aiUsageLog.create);
    create.mockResolvedValue({} as never);
    const t = await setup({ realDefaults: true });

    count.mockResolvedValue(9);
    expect((await t.call("7:STUDENT")).status).toBe(200);
    expect(create).not.toHaveBeenCalled();

    count.mockResolvedValue(10);
    expect((await t.call("7:STUDENT")).status).toBe(429);
    expect(count).toHaveBeenLastCalledWith({
      where: {
        userId: 7,
        status: { in: ["ok", "error"] },
        createdAt: { gte: expect.any(Date), lt: expect.any(Date) },
      },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { userId: 7, task: "grade_writing", status: "rate_limited", tokens: null },
    });
  });

  it("task sai báo lỗi ngay lúc khai báo route", () => {
    expect(() => aiRateLimit("khong_hop_le" as AiTask)).toThrow();
  });
});