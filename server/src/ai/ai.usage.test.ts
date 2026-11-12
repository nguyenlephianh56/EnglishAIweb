import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma giả cho đường dẫn mặc định (db không truyền vào). Không cần DB thật.
vi.mock("../config/prisma", () => ({
  prisma: { aiUsageLog: { count: vi.fn(), create: vi.fn() } },
}));

import { prisma } from "../config/prisma";
import {
  countAiUsageToday,
  createPrismaUsageCounter,
  createPrismaUsageLogger,
  dailyLimitForRole,
  sumTokens,
  vnDayStart,
  vnNextDayStart,
} from "./ai.usage";
import type { AiUsageDb } from "./ai.usage";

const iso = (d: Date) => d.toISOString();

/** DB giả có lọc theo where giống Prisma (userId, status in, createdAt gte/lt). */
function fakeDb() {
  type Row = { userId: number; task: string; status: string; tokens: number | null; createdAt: Date };
  const rows: Row[] = [];
  const db: AiUsageDb = {
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
        rows.push({ ...data, createdAt: new Date() });
        return data;
      },
    },
  };
  const add = (userId: number, status: string, at: string) =>
    rows.push({ userId, task: "generate", status, tokens: null, createdAt: new Date(at) });
  return { db, rows, add };
}

describe("vnDayStart / vnNextDayStart (00:00 giờ Việt Nam = 17:00 UTC hôm trước)", () => {
  it("giữa ngày VN", () => {
    // 10:00 UTC = 17:00 VN ngày 12/11
    expect(iso(vnDayStart(new Date("2026-11-12T10:00:00Z")))).toBe("2026-11-11T17:00:00.000Z");
  });

  it("07:00 VN (00:00 UTC) vẫn thuộc ngày VN đó", () => {
    expect(iso(vnDayStart(new Date("2026-11-12T00:00:00Z")))).toBe("2026-11-11T17:00:00.000Z");
  });

  it("23:59:59.999 VN vẫn là ngày cũ", () => {
    expect(iso(vnDayStart(new Date("2026-11-12T16:59:59.999Z")))).toBe("2026-11-11T17:00:00.000Z");
  });

  it("ĐÚNG 00:00 VN là bắt đầu ngày mới", () => {
    expect(iso(vnDayStart(new Date("2026-11-12T17:00:00.000Z")))).toBe("2026-11-12T17:00:00.000Z");
  });

  it("qua năm mới theo giờ VN", () => {
    // 31/12/2026 18:00 UTC = 01/01/2027 01:00 VN
    expect(iso(vnDayStart(new Date("2026-12-31T18:00:00Z")))).toBe("2026-12-31T17:00:00.000Z");
  });

  it("ngày kế tiếp = +24 giờ", () => {
    expect(iso(vnNextDayStart(new Date("2026-11-12T10:00:00Z")))).toBe("2026-11-12T17:00:00.000Z");
  });
});

describe("countAiUsageToday", () => {
  const NOW = new Date("2026-11-12T10:00:00Z"); // 17:00 VN ngày 12/11
  const DAY = "2026-11-11T17:00:00Z"; // 00:00 VN 12/11

  it("chỉ đếm ok + error; cached và rate_limited không tính", async () => {
    const { db, add } = fakeDb();
    add(1, "ok", "2026-11-12T01:00:00Z");
    add(1, "error", "2026-11-12T02:00:00Z");
    add(1, "cached", "2026-11-12T03:00:00Z");
    add(1, "rate_limited", "2026-11-12T04:00:00Z");
    expect(await countAiUsageToday(1, NOW, db)).toBe(2);
  });

  it("truy vấn đúng: userId, status in [ok,error], khoảng ngày VN", async () => {
    const count = vi.fn(async () => 0);
    const db = { aiUsageLog: { count, create: vi.fn() } } as unknown as AiUsageDb;
    await countAiUsageToday(7, NOW, db);
    expect(count).toHaveBeenCalledWith({
      where: {
        userId: 7,
        status: { in: ["ok", "error"] },
        createdAt: { gte: new Date(DAY), lt: new Date("2026-11-12T17:00:00Z") },
      },
    });
  });

  it("user A hết lượt không ảnh hưởng user B", async () => {
    const { db, add } = fakeDb();
    for (let i = 0; i < 10; i++) add(1, "ok", "2026-11-12T01:00:00Z");
    add(2, "ok", "2026-11-12T01:00:00Z");
    expect(await countAiUsageToday(1, NOW, db)).toBe(10);
    expect(await countAiUsageToday(2, NOW, db)).toBe(1);
  });

  it("dòng ĐÚNG 00:00 VN tính vào ngày mới, dòng 23:59:59.999 VN tính vào ngày cũ", async () => {
    const { db, add } = fakeDb();
    add(1, "ok", "2026-11-11T16:59:59.999Z"); // cuối ngày 11/11 VN
    add(1, "ok", "2026-11-11T17:00:00.000Z"); // đầu ngày 12/11 VN
    expect(await countAiUsageToday(1, NOW, db)).toBe(1);
  });

  it("sang ngày mới (00:00 VN) -> đếm lại từ 0", async () => {
    const { db, add } = fakeDb();
    add(1, "ok", "2026-11-12T01:00:00Z");
    add(1, "error", "2026-11-12T05:00:00Z");
    add(1, "ok", "2026-11-12T16:59:00Z");

    expect(await countAiUsageToday(1, new Date("2026-11-12T16:59:59Z"), db)).toBe(3);
    // 1 giây sau: đã là 00:00 VN ngày 13/11
    expect(await countAiUsageToday(1, new Date("2026-11-12T17:00:00Z"), db)).toBe(0);
  });

  it("log của ngày trước không tính vào hôm nay", async () => {
    const { db, add } = fakeDb();
    add(1, "ok", "2026-11-10T10:00:00Z");
    expect(await countAiUsageToday(1, NOW, db)).toBe(0);
  });

  it("đường mặc định dùng prisma.aiUsageLog.count", async () => {
    const count = prisma.aiUsageLog.count as unknown as ReturnType<typeof vi.fn>;
    count.mockResolvedValueOnce(4);
    expect(await countAiUsageToday(1, NOW)).toBe(4);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("createPrismaUsageCounter gọi đúng hàm đếm", async () => {
    const { db, add } = fakeDb();
    add(1, "ok", "2026-11-12T01:00:00Z");
    expect(await createPrismaUsageCounter(db).countUsedToday(1, NOW)).toBe(1);
  });
});

describe("createPrismaUsageLogger", () => {
  it("ghi đúng 1 dòng với đúng 4 trường user_id/task/status/tokens", async () => {
    const create = vi.fn(async () => ({}));
    const db = { aiUsageLog: { count: vi.fn(), create } } as unknown as AiUsageDb;

    await createPrismaUsageLogger(db).log({
      userId: 5,
      task: "grade_writing",
      status: "ok",
      tokens: 123,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { userId: 5, task: "grade_writing", status: "ok", tokens: 123 },
    });
  });

  it("entry có trường thừa (prompt/bài làm) cũng KHÔNG được ghi", async () => {
    const create = vi.fn(async () => ({}));
    const db = { aiUsageLog: { count: vi.fn(), create } } as unknown as AiUsageDb;
    const sneaky = {
      userId: 5,
      task: "generate",
      status: "cached",
      tokens: null,
      prompt: "BÀI LÀM RIÊNG TƯ",
      raw: "PHẢN HỒI THÔ",
    } as never;

    await createPrismaUsageLogger(db).log(sneaky);

    const data = (create.mock.calls[0] as unknown as [{ data: object }])[0].data;
    expect(Object.keys(data).sort()).toEqual(["status", "task", "tokens", "userId"]);
    expect(JSON.stringify(data)).not.toContain("RIÊNG TƯ");
    expect(JSON.stringify(data)).not.toContain("THÔ");
  });

  it("DB lỗi -> logger ném lỗi lên (service sẽ quyết định nuốt)", async () => {
    const db = {
      aiUsageLog: { count: vi.fn(), create: vi.fn(async () => { throw new Error("db down"); }) },
    } as unknown as AiUsageDb;
    await expect(
      createPrismaUsageLogger(db).log({ userId: 1, task: "path", status: "error", tokens: null })
    ).rejects.toThrow("db down");
  });

  it("log rồi đếm được: ok tính, cached không tính", async () => {
    const { db } = fakeDb();
    const logger = createPrismaUsageLogger(db);
    await logger.log({ userId: 1, task: "generate", status: "ok", tokens: 10 });
    await logger.log({ userId: 1, task: "generate", status: "cached", tokens: null });
    expect(await countAiUsageToday(1, new Date(), db)).toBe(1);
  });

  it("đường mặc định dùng prisma.aiUsageLog.create", async () => {
    const create = prisma.aiUsageLog.create as unknown as ReturnType<typeof vi.fn>;
    create.mockResolvedValueOnce({});
    await createPrismaUsageLogger().log({ userId: 1, task: "path", status: "ok", tokens: null });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("sumTokens", () => {
  it("input + output", () => expect(sumTokens({ input: 10, output: 5 })).toBe(15));
  it("chỉ có một phần", () => {
    expect(sumTokens({ input: 10 })).toBe(10);
    expect(sumTokens({ output: 5 })).toBe(5);
  });
  it("provider không báo -> null", () => {
    expect(sumTokens(undefined)).toBeNull();
    expect(sumTokens({})).toBeNull();
  });
  it("0 token vẫn là số 0, không phải null", () => {
    expect(sumTokens({ input: 0, output: 0 })).toBe(0);
  });
});

describe("dailyLimitForRole", () => {
  const limits = { student: 10, teacher: 50 };
  it("STUDENT -> mức học sinh", () => expect(dailyLimitForRole("STUDENT", limits)).toBe(10));
  it("TEACHER -> mức giáo viên", () => expect(dailyLimitForRole("TEACHER", limits)).toBe(50));
  it("ADMIN -> dùng mức giáo viên", () => expect(dailyLimitForRole("ADMIN", limits)).toBe(50));
});

beforeEach(() => {
  vi.clearAllMocks();
});