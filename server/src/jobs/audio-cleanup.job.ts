/**
 * T19: job dọn file âm thanh mồ côi. Việc dọn nằm ở cleanupExpiredAudio (attempts.audio.cleanup.ts);
 * file này chỉ lo LỊCH: chạy 1 lần lúc khởi động rồi lặp theo chu kỳ trong .env.
 *  - TTL: AUDIO_TTL_MINUTES; chu kỳ: AUDIO_CLEANUP_INTERVAL_MINUTES (không ghi cứng).
 *  - KHÔNG khởi động khi NODE_ENV=test.
 *  - Không bao giờ ném lỗi ra ngoài (lỗi chỉ log mã); không chạy chồng hai lượt quét.
 *  - Không log tên file/đường dẫn; chỉ log số lượng.
 */
import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env";
import { cleanupExpiredAudio } from "../modules/attempts/attempts.audio.cleanup";

/** Biểu thức cron "mỗi N phút" (N từ 1 đến 59). */
export const audioCleanupExpression = (minutes: number): string => {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 59) {
    throw new RangeError("Chu kỳ dọn âm thanh phải là số nguyên phút từ 1 đến 59");
  }
  return `*/${minutes} * * * *`;
};

let running = false;

/** Một lượt dọn. Bỏ qua nếu lượt trước chưa xong. Không bao giờ ném lỗi. */
export const runAudioCleanup = async (
  clean: typeof cleanupExpiredAudio = cleanupExpiredAudio,
  now: () => Date = () => new Date()
): Promise<void> => {
  if (running) return;
  running = true;
  try {
    const result = await clean({ now: now(), ttlMs: env.AUDIO_TTL_MINUTES * 60_000 });
    if (result.deleted > 0 || result.failed > 0) {
      console.log(`[audio] cleanup deleted=${result.deleted} failed=${result.failed}`);
    }
  } catch {
    console.error("[audio] AUDIO_CLEANUP_FAILED");
  } finally {
    running = false;
  }
};

/** Cổng để test: thay lịch và hàm chạy bằng bản giả. Chạy thật thì bỏ trống. */
export interface AudioCleanupJobDeps {
  schedule?: typeof cron.schedule;
  run?: () => Promise<void>;
}

/** Gọi 1 lần ở server.ts. Trả null khi đang chạy test (không đăng ký, không quét). */
export const startAudioCleanupJob = (deps: AudioCleanupJobDeps = {}): ScheduledTask | null => {
  if (process.env.NODE_ENV === "test") return null;

  const schedule = deps.schedule ?? cron.schedule;
  const run = deps.run ?? (() => runAudioCleanup());
  const expression = audioCleanupExpression(env.AUDIO_CLEANUP_INTERVAL_MINUTES);

  void run(); // quét 1 lần lúc khởi động (dọn file sót của lần chạy trước)
  return schedule(expression, () => {
    void run();
  });
};