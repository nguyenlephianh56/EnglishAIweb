import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { runReminderScan } from "./notifications.reminder";

type ScanResult = Awaited<ReturnType<typeof runReminderScan>>;

const { scan, schedule, listen, startAudioCleanupJob } = vi.hoisted(() => ({
  scan: vi.fn<typeof runReminderScan>(),
  schedule: vi.fn<(expression: string, run: () => Promise<void>) => { stop: () => void }>(),
  listen: vi.fn<(port: number, onListening: () => void) => void>(),
  startAudioCleanupJob: vi.fn(),
}));

vi.mock("dotenv/config", () => ({}));
vi.mock("node-cron", () => ({ default: { schedule } }));
vi.mock("./notifications.reminder", () => ({ runReminderScan: scan }));
vi.mock("../../app", () => ({ app: { listen } }));
vi.mock("../../jobs/audio-cleanup.job", () => ({ startAudioCleanupJob }));

const now = new Date("2026-11-22T00:00:00.000Z");
const task = { stop: vi.fn() };
const emptyScan = { scanned: 0, created: 0, failed: 0 };
const loadJob = () => import("../../jobs/reminder.job");
const loadEnv = async () => (await import("../../config/env")).env;
const tick = () => schedule.mock.calls[0][1]();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  vi.stubEnv("JWT_SECRET", "t25-reminder-test-key");
  vi.stubEnv("REMINDER_SCAN_INTERVAL_MINUTES", undefined);
  vi.setSystemTime(now);
  scan.mockReset().mockResolvedValue(emptyScan);
  schedule.mockReset().mockReturnValue(task);
  listen.mockReset();
  startAudioCleanupJob.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("job nhắc hạn", () => {
  it("NODE_ENV=test trả null, không quét hoặc đăng ký lịch", async () => {
    const { startReminderJob } = await loadJob();
    expect(startReminderJob()).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
  });

  it("quét một lần ngay lúc khởi động rồi dùng biểu thức cron theo env", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REMINDER_SCAN_INTERVAL_MINUTES", "7");
    const { startReminderJob } = await loadJob();

    expect(startReminderJob()).toBe(task);
    expect(schedule.mock.calls).toEqual([["*/7 * * * *", expect.any(Function)]]);
    expect(scan.mock.calls).toEqual([[{ now }]]);

    await Promise.resolve();
    const later = new Date("2026-11-22T00:07:00.000Z");
    vi.setSystemTime(later);
    await tick();
    expect(scan.mock.calls).toEqual([[{ now }], [{ now: later }]]);
  });

  it("bỏ qua lượt chạy chồng và chạy lại khi lượt trước kết thúc", async () => {
    vi.stubEnv("NODE_ENV", "development");
    let finish!: (result: ScanResult) => void;
    scan.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    (await loadJob()).startReminderJob();

    await tick();
    expect(scan).toHaveBeenCalledTimes(1);
    finish(emptyScan);
    await Promise.resolve();

    await tick();
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("lỗi quét chỉ log mã và lượt kế tiếp vẫn chạy", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    (await loadJob()).startReminderJob();
    await Promise.resolve();

    scan.mockRejectedValueOnce(new Error("Nội dung và ID giả cần giữ kín"));
    await expect(tick()).resolves.toBeUndefined();
    expect(errorLog.mock.calls).toEqual([["REMINDER_SCAN_FAILED"]]);
    await tick();
    expect(scan).toHaveBeenCalledTimes(3);
  });

  it("chỉ log số lượng khi có thông báo mới hoặc bài lỗi", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    (await loadJob()).startReminderJob();
    await Promise.resolve();
    expect(log).not.toHaveBeenCalled();

    scan.mockResolvedValueOnce({ scanned: 4, created: 2, failed: 1 });
    await tick();
    expect(log.mock.calls).toEqual([["[reminder] scanned=4 created=2 failed=1"]]);
  });

  it("bắt lỗi đăng ký lịch và chỉ log mã", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    schedule.mockImplementationOnce(() => { throw new Error("Chi tiết lỗi giả"); });

    expect((await loadJob()).startReminderJob()).toBeNull();
    expect(errorLog.mock.calls).toEqual([["REMINDER_SCAN_FAILED"]]);
  });

  it("server khởi động job nhắc hạn cạnh job dọn âm thanh", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    listen.mockImplementation((_port, onListening) => onListening());

    await import("../../server");

    expect(listen).toHaveBeenCalledTimes(1);
    expect(startAudioCleanupJob).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls).toEqual([["*/5 * * * *", expect.any(Function)]]);
    expect(scan.mock.calls).toEqual([[{ now }]]);
  });
});

describe("REMINDER_SCAN_INTERVAL_MINUTES", () => {
  it.each([[undefined, 5], ["", 5], ["1", 1], ["59", 59]] as const)(
    "giá trị %s được đọc thành %s",
    async (raw, expected) => {
      vi.stubEnv("REMINDER_SCAN_INTERVAL_MINUTES", raw);
      expect((await loadEnv()).REMINDER_SCAN_INTERVAL_MINUTES).toBe(expected);
    }
  );

  it.each(["0", "-1", "60", "2.5", "abc"])("từ chối giá trị %s", async (raw) => {
    vi.stubEnv("REMINDER_SCAN_INTERVAL_MINUTES", raw);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("process.exit"); });
    await expect(loadEnv()).rejects.toThrow("process.exit");
    expect(log.mock.calls).toEqual([["Invalid environment variables", ["REMINDER_SCAN_INTERVAL_MINUTES"]]]);
  });
});