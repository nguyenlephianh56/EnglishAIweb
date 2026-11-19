import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import type { AiTask } from "../../src/ai/ai.types";
import { writingCriteriaSchema } from "../../src/ai/schemas/writing.schema";
import { WRITING_TEXT_MAX } from "../../src/modules/attempts/attempts.constants";
import { validateWritingLength, type WritingBaseLimits } from "../../src/modules/grading/writingLength";
import { computeWritingScore, type WritingCriteria } from "../../src/modules/grading/writingScore";
import { PROFILE_SCORE_MAX, PROFILE_SCORE_MIN } from "../../src/modules/skill-profiles/skill-profiles.constants";
import type { WritingSample } from "./samples";

const aiErrorCode = z.enum([
  "AI_INVALID_FORMAT", "TIMEOUT", "AI_UNAVAILABLE", "AI_ERROR", "RATE_LIMITED", "AI_QUOTA_EXCEEDED",
]);
type AiErrorCode = z.infer<typeof aiErrorCode>;
type StopCode = "RATE_LIMITED" | "AI_QUOTA_EXCEEDED";

const checkpointSchema = z.array(z.union([
  z.object({
    id: z.string().min(1),
    ai_score: z.number().finite().min(PROFILE_SCORE_MIN).max(PROFILE_SCORE_MAX),
    criteria: writingCriteriaSchema,
  }).strict(),
  z.object({ id: z.string().min(1), error_code: aiErrorCode }).strict(),
]));
type CheckpointEntry = z.infer<typeof checkpointSchema>[number];

export class EvaluationError extends Error {}

export interface EvaluationResult {
  scored: Array<{ id: string; manual_score: number; ai_score: number }>;
  aiErrors: Array<{ id: string; code: AiErrorCode }>;
  rejectedLength: Array<{ id: string; code: "WRITING_TOO_SHORT" | "WRITING_TOO_LONG" }>;
  reused: number;
  pending: number;
  stoppedBy: StopCode | null;
}

interface EvaluationOptions {
  checkpointPath: string;
  limits: WritingBaseLimits;
  delayMs: number;
  refresh: boolean;
  grade: (sample: WritingSample) => Promise<{ criteria: WritingCriteria }>;
  wait?: (ms: number) => Promise<void>;
  onResult?: (result: EvaluationResult) => Promise<void>;
}

async function loadCheckpoint(path: string): Promise<Map<string, CheckpointEntry>> {
  let data: string;
  try {
    data = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw new EvaluationError(`Không đọc được file kết quả trung gian ở ${path}.`);
  }

  try {
    const entries = checkpointSchema.parse(JSON.parse(data));
    const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
    if (byId.size === entries.length) return byId;
  } catch {
    // Thông báo bên dưới tránh in nội dung file và chi tiết lỗi JSON/Zod.
  }
  throw new EvaluationError(`File kết quả trung gian ở ${path} không hợp lệ.`);
}

async function saveCheckpoint(path: string, entries: Map<string, CheckpointEntry>): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify([...entries.values()], null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch {
    throw new EvaluationError(`Không lưu được file kết quả trung gian ở ${path}.`);
  }
}

export async function runWritingEvaluation(
  samples: readonly WritingSample[],
  options: EvaluationOptions,
): Promise<EvaluationResult> {
  const { checkpointPath, limits, delayMs, refresh, grade, wait = sleep } = options;
  const lockPath = `${checkpointPath}.lock`;
  await mkdir(dirname(checkpointPath), { recursive: true });
  const lock = await open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") {
      throw new EvaluationError(`Đã có khóa ${lockPath}. Nếu lần chạy trước bị tắt đột ngột, hãy kiểm tra các tiến trình eval:ai đã dừng rồi xóa file khóa.`);
    }
    throw new EvaluationError(`Không tạo được file khóa ở ${lockPath}.`);
  });

  try {
    const entries = await loadCheckpoint(checkpointPath);
    const result: EvaluationResult = {
      scored: [], aiErrors: [], rejectedLength: [], reused: 0, pending: 0, stoppedBy: null,
    };
    const queued: WritingSample[] = [];
    for (const sample of samples) {
      const { id, text, minWords, manual_score } = sample;
      if (text.length > WRITING_TEXT_MAX) {
        result.rejectedLength.push({ id, code: "WRITING_TOO_LONG" });
        continue;
      }
      const length = validateWritingLength(text, minWords, limits);
      if (!length.ok) {
        result.rejectedLength.push({ id, code: length.code });
        continue;
      }

      const previous = entries.get(id);
      if (!refresh && previous && "ai_score" in previous) {
        result.scored.push({ id, manual_score, ai_score: previous.ai_score });
        result.reused++;
      } else {
        queued.push(sample);
      }
    }

    if (refresh) {
      // Khi tiếp tục sau hạn mức, chỉ dùng điểm đã có trong đợt chấm lại.
      let removedPreviousScores = false;
      for (const { id } of queued) {
        if (entries.delete(id)) removedPreviousScores = true;
      }
      if (removedPreviousScores) await saveCheckpoint(checkpointPath, entries);
    }

    for (const [index, sample] of queued.entries()) {
      if (index > 0 && delayMs > 0) await wait(delayMs);
      const { id, manual_score } = sample;
      let entry: CheckpointEntry;
      try {
        const { content, coherence, vocabulary, grammar } = (await grade(sample)).criteria;
        const criteria = { content, coherence, vocabulary, grammar };
        entry = { id, ai_score: computeWritingScore(criteria), criteria };
      } catch (error) {
        const code = aiErrorCode.safeParse((error as { code?: unknown } | null)?.code);
        if (!code.success) throw new EvaluationError("Đã dừng chấm do lỗi ngoài luồng AI. Điểm đã lưu có thể dùng để tiếp tục.");
        entry = { id, error_code: code.data };
      }

      entries.set(id, entry);
      await saveCheckpoint(checkpointPath, entries);
      if ("ai_score" in entry) {
        result.scored.push({ id, manual_score, ai_score: entry.ai_score });
        continue;
      }

      const code = entry.error_code;
      if (code === "RATE_LIMITED" || code === "AI_QUOTA_EXCEEDED") {
        result.stoppedBy = code;
        // Bài vừa chạm giới hạn cũng chưa có điểm và cần chạy lại.
        result.pending = queued.length - index;
        break;
      }
      result.aiErrors.push({ id, code });
    }

    // Giữ khóa cho đến khi xuất xong kết quả của lượt chạy này.
    await options.onResult?.(result);
    return result;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export async function runLiveEvaluation(
  samples: readonly WritingSample[],
  checkpointPath: string,
  refresh: boolean,
  onResult?: EvaluationOptions["onResult"],
): Promise<EvaluationResult> {
  const { env } = await import("../../src/config/env");
  const userId = Number(process.env.AI_EVAL_USER_ID);
  const delayMs = Number(process.env.AI_EVAL_DELAY_MS?.trim() || "3000");
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new EvaluationError("Cần đặt AI_EVAL_USER_ID bằng ID của tài khoản giáo viên đánh giá.");
  }
  if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 2_147_483_647) {
    throw new EvaluationError("AI_EVAL_DELAY_MS phải là số nguyên từ 0 đến 2147483647.");
  }
  if (!env.GEMINI_API_KEY) throw new EvaluationError("Cần cấu hình GEMINI_API_KEY để chấm bài.");

  const { prisma } = await import("../../src/config/prisma");
  try {
    const teacher = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
    if (teacher?.role !== "TEACHER" || teacher.status !== "ACTIVE") {
      throw new EvaluationError("AI_EVAL_USER_ID phải trỏ tới tài khoản TEACHER đang ACTIVE.");
    }

    const { gradeWriting } = await import("../../src/ai/writingGrader");
    // Refresh bỏ qua cache T9 cho riêng lượt chạy này. Counter và logger giữ theo T9.
    const deps = refresh ? { ai: { cacheableTasks: new Set<AiTask>() } } : undefined;
    return await runWritingEvaluation(samples, {
      checkpointPath,
      limits: { maxWords: env.WRITING_MAX_WORDS, maxChars: env.WRITING_MAX_CHARS },
      delayMs,
      refresh,
      onResult,
      grade: ({ prompt, text, level, minWords }) => gradeWriting({
        userId, role: "TEACHER", prompt, text, level, minWords,
      }, deps),
    });
  } finally {
    await prisma.$disconnect();
  }
}