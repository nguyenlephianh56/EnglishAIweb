/** T19 (bước 3): job dọn âm thanh. Không đụng hệ thống file, không cần DB, không chạy cron thật. */
import cron from "node-cron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cleanupMock } = vi.hoisted(() => ({ cleanupMock: vi.fn() }));
vi.mock("../config/env", () => ({
  env: { AUDIO_TTL_MINUTES: 45, AUDIO_CLEANUP_INTERVAL_MINUTES: 15 },
}));
vi.mock("../modules/attempts/attempts.audio.cleanup", () => ({ cleanupExpiredAudio: cleanupMock }));

import {
  audioCleanupExpression,
  runAudioCleanup,
  startAudioCleanupJob,
} from "./audio-cleanup.job";

const NOW = new Date("2026-11-19T12:00:00.000Z");

beforeEach(() => {
  cleanupMock.mockReset();
  cleanupMock.mockResolvedValue({ scanned: 0, deleted: 0, failed: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("audioCleanupExpression", () => {
  it.each([1, 10, 15, 59])("%s phút -> biểu thức cron hợp lệ", (minutes) => {
    const expression = audioCleanupExpression(minutes);
    expect(expression).toBe(`*/${minutes} * * * *`);
    expect(cron.validate(expression)).toBe(true);
  });

  it.each([0, -5, 60, 1.5, Number.NaN])("%s phút -> RangeError", (minutes) => {
    expect(() => audioCleanupExpression(minutes)).toThrow(RangeError);
  });
});

describe("startAudioCleanupJob", () => {
  it("NODE_ENV=test (mặc định của vitest): không đăng ký lịch, không quét", () => {
    expect(process.env.NODE_ENV).toBe("test");
    const schedule = vi.fn();
    const run = vi.fn(async () => undefined);
    expect(startAudioCleanupJob({ schedule: schedule as never, run })).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("không truyền gì (bản thật) khi chạy test: trả null, không quét", () => {
    expect(startAudioCleanupJob()).toBeNull();
    expect(cleanupMock).not.toHaveBeenCalled();
  });

  it("ngoài test: quét 1 lần lúc khởi động và đăng ký đúng chu kỳ từ .env (15 phút)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const task = { stop: vi.fn() };
    const schedule = vi.fn(() => task);
    const run = vi.fn(async () => undefined);

    const result = startAudioCleanupJob({ schedule: schedule as never, run });

    expect(result).toBe(task);
    expect(run).toHaveBeenCalledTimes(1); // lúc khởi động
    expect(schedule).toHaveBeenCalledTimes(1);
    const [expression, callback] = schedule.mock.calls[0] as unknown as [string, () => void];
    expect(expression).toBe("*/15 * * * *");
    expect(cron.validate(expression)).toBe(true);

    callback(); // tới giờ chạy theo lịch
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("runAudioCleanup", () => {
  it("gọi cleanupExpiredAudio với now và ttlMs = AUDIO_TTL_MINUTES * 60000", async () => {
    await runAudioCleanup(cleanupMock, () => NOW);
    expect(cleanupMock).toHaveBeenCalledWith({ now: NOW, ttlMs: 45 * 60_000 });
  });

  it("chỉ log số lượng khi có việc; không có gì để dọn thì im lặng", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runAudioCleanup(cleanupMock, () => NOW);
    expect(log).not.toHaveBeenCalled();

    cleanupMock.mockResolvedValue({ scanned: 3, deleted: 2, failed: 1 });
    await runAudioCleanup(cleanupMock, () => NOW);
    expect(log).toHaveBeenCalledWith("[audio] cleanup deleted=2 failed=1");
  });

  it("hàm dọn ném lỗi: không ném ra ngoài, chỉ log mã (không log nội dung lỗi/đường dẫn)", async () => {
    cleanupMock.mockRejectedValue(new Error("EACCES /secret/path/7__abc.webm"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(runAudioCleanup(cleanupMock, () => NOW)).resolves.toBeUndefined();
    expect(JSON.stringify(err.mock.calls)).toContain("AUDIO_CLEANUP_FAILED");
    expect(JSON.stringify(err.mock.calls)).not.toContain("/secret");
  });

  it("lượt trước chưa xong thì lượt sau bị bỏ qua (không chạy chồng); xong rồi chạy lại được", async () => {
    let release!: () => void;
    cleanupMock.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ scanned: 0, deleted: 0, failed: 0 }); })
    );
    const first = runAudioCleanup(cleanupMock, () => NOW);
    await runAudioCleanup(cleanupMock, () => NOW); // bị bỏ qua
    expect(cleanupMock).toHaveBeenCalledTimes(1);
    release();
    await first;

    cleanupMock.mockResolvedValue({ scanned: 0, deleted: 0, failed: 0 });
    await runAudioCleanup(cleanupMock, () => NOW);
    expect(cleanupMock).toHaveBeenCalledTimes(2);
  });
});