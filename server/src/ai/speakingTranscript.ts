import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { runAiTask, type AiServiceDeps } from "./ai.service";
import { AIQuotaExceededError } from "./ai.types";
import { AIInvalidFormatError } from "./json";
import {
  buildPrompt,
  type PromptTemplateDb,
} from "./prompts/prompt-templates";
import { AIServiceError } from "./resilience";
import { speakingTranscriptSchema } from "./schemas/speaking.schema";
import {
  SPEAKING_AUDIO_MIME_TYPES,
  SPEAKING_INLINE_OVERHEAD_BYTES,
  SPEAKING_INLINE_REQUEST_MAX_BYTES,
  SPEAKING_TRANSCRIPT_MAX_CHARS,
} from "./speaking.constants";

export interface SpeakingTranscriptInput {
  /** Server lấy từ tài khoản STUDENT đã xác thực, không lấy từ body FE. */
  studentId: number;
  audio_id?: unknown;
  transcript?: unknown;
}

/** usageLogId chỉ đi giữa các bước trên server. */
export type SpeakingTranscriptResult =
  | { text: string; source: "client" }
  | { text: string; source: "gemini"; usageLogId?: number };

/** Các cổng tùy chọn để test; chạy thật thì bỏ trống. */
export interface SpeakingTranscriptDeps {
  ai?: Partial<AiServiceDeps>;
  promptDb?: PromptTemplateDb;
  /** T19: giành quyền dùng file (rename nguyên tử). Trả null nếu không có/đã bị dùng. */
  claimAudio?: (
    studentId: number,
    audioId: string
  ) => Promise<ClaimedAudio | null>;
  /** T19: xóa file đã claim; không được ném lỗi. */
  deleteAudio?: (claimedPath: string) => Promise<void>;
  readAudio?: (audioPath: string) => Promise<Buffer>;
}

/** Khớp ClaimedAudio của attempts.audio.upload (khai báo lại để không import module đó khi nạp file). */
interface ClaimedAudio {
  path: string;
  /** Đuôi âm thanh gốc, vd ".webm". */
  ext: string;
}

export type SpeakingTranscriptErrorCode =
  | "SPEAKING_TRANSCRIPT_INVALID_INPUT"
  | "AUDIO_NOT_FOUND"
  | "AUDIO_INVALID_FORMAT"
  | "AUDIO_TOO_LARGE"
  | "AUDIO_STORAGE_ERROR"
  | "TRANSCRIPT_EMPTY";

export class SpeakingTranscriptError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: SpeakingTranscriptErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SpeakingTranscriptError";
  }
}

const inputSchema = z.object({
  studentId: z.number().int().positive().safe(),
  audio_id: z.unknown().optional(),
  transcript: z.unknown().optional(),
}).strict();

const clientTextSchema = z.string()
  .trim()
  .min(1)
  .max(SPEAKING_TRANSCRIPT_MAX_CHARS);

const invalidInput = () => new SpeakingTranscriptError(
  400,
  "SPEAKING_TRANSCRIPT_INVALID_INPUT",
  `Chỉ gửi một nguồn: audio_id hoặc transcript không rỗng, tối đa ${SPEAKING_TRANSCRIPT_MAX_CHARS} ký tự.`
);

const audioNotFound = () => new SpeakingTranscriptError(
  404,
  "AUDIO_NOT_FOUND",
  "Không tìm thấy tệp âm thanh của học sinh này."
);

const invalidAudio = () => new SpeakingTranscriptError(
  400,
  "AUDIO_INVALID_FORMAT",
  "Tệp âm thanh phải là webm, mp3 hoặc wav và không rỗng."
);

/** Tính base64, prompt đã escape JSON và phần dự phòng. */
function assertInlineBudget(audioBytes: number, prompt = ""): void {
  const bytes =
    4 * Math.ceil(audioBytes / 3)
    + Buffer.byteLength(JSON.stringify(prompt), "utf8")
    + SPEAKING_INLINE_OVERHEAD_BYTES;

  if (bytes > SPEAKING_INLINE_REQUEST_MAX_BYTES) {
    throw new SpeakingTranscriptError(
      413,
      "AUDIO_TOO_LARGE",
      "Âm thanh và prompt vượt giới hạn gửi trực tiếp tới AI."
    );
  }
}

async function readUploadedAudio(audioPath: string): Promise<Buffer> {
  const info = await stat(audioPath);
  if (!info.isFile()) throw audioNotFound();

  // Chặn file lớn trước khi cấp Buffer.
  assertInlineBudget(info.size);
  return readFile(audioPath);
}

async function loadAudio(claimed: ClaimedAudio, deps: SpeakingTranscriptDeps) {
  try {
    const mimeType = SPEAKING_AUDIO_MIME_TYPES[claimed.ext.toLowerCase()];
    if (!mimeType) throw invalidAudio();

    const data = await (deps.readAudio ?? readUploadedAudio)(claimed.path);
    if (!Buffer.isBuffer(data) || data.length === 0) throw invalidAudio();

    // Kiểm lại nếu file đổi kích thước sau stat.
    assertInlineBudget(data.length);
    return { mimeType, data };
  } catch (error) {
    if (error instanceof SpeakingTranscriptError) throw error;

    const code = (error as { code?: unknown } | null)?.code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") {
      throw audioNotFound();
    }

    throw storageError();
  }
}

const storageError = () => new SpeakingTranscriptError(
  500,
  "AUDIO_STORAGE_ERROR",
  "Không đọc được tệp âm thanh. Vui lòng thử lại sau."
);

/** Xóa file đã claim; mọi lỗi chỉ log mã, không ảnh hưởng kết quả chính (T19). */
async function safeDelete(
  remove: (claimedPath: string) => Promise<void>,
  claimedPath: string
): Promise<void> {
  try {
    await remove(claimedPath);
  } catch {
    console.error("[audio] AUDIO_DELETE_FAILED");
  }
}

/**
 * Chỉ lấy bản chữ; không lưu attempt, không chấm điểm.
 * Nhánh audio_id (T19): claim file (dùng được MỘT lần) -> đọc -> gọi Gemini -> `finally` xóa file,
 * cho cả thành công lẫn mọi lỗi. Nhánh transcript không đụng hệ thống file.
 */
export async function getSpeakingTranscript(
  input: SpeakingTranscriptInput,
  deps: SpeakingTranscriptDeps = {}
): Promise<SpeakingTranscriptResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput();

  const { studentId, audio_id, transcript } = parsed.data;
  const hasAudio = audio_id !== undefined;
  const hasClient = transcript !== undefined;

  if (hasAudio === hasClient) throw invalidInput();

  // Nguồn client: không gọi AI, không kiểm lượt, không ghi log.
  if (hasClient) {
    const client = clientTextSchema.safeParse(transcript);
    if (!client.success) throw invalidInput();

    return { text: client.data, source: "client" };
  }

  if (typeof audio_id !== "string") throw audioNotFound();

  const upload = deps.claimAudio && deps.deleteAudio
    ? undefined
    : await import("../modules/attempts/attempts.audio.upload");
  const claimAudio = deps.claimAudio ?? upload!.claimAudioFile;
  const deleteAudio = deps.deleteAudio ?? upload!.deleteClaimedAudio;

  let claimed: ClaimedAudio | null;
  try {
    claimed = await claimAudio(studentId, audio_id);
  } catch {
    throw storageError();
  }
  if (claimed === null) throw audioNotFound();

  try {
    const audio = await loadAudio(claimed, deps);
    return await transcribe(studentId, audio, deps);
  } finally {
    await safeDelete(deleteAudio, claimed.path);
  }
}

async function transcribe(
  studentId: number,
  audio: { mimeType: string; data: Buffer },
  deps: SpeakingTranscriptDeps
): Promise<SpeakingTranscriptResult> {
  let prompt: string;
  try {
    prompt = await buildPrompt("speaking_transcribe", {}, deps.promptDb);
  } catch {
    throw new AIServiceError("AI_UNAVAILABLE", 0);
  }

  assertInlineBudget(audio.data.length, prompt);

  try {
    let usageLogId: number | undefined;
    const result = await runAiTask({
      userId: studentId,
      role: "STUDENT",
      task: "grade_speaking",
      prompt,
      schema: speakingTranscriptSchema,
      audio,
      onUsageLogCreated: (id) => { usageLogId = id; },
      validateGeneratedResult: ({ text }) => {
        if (text.length === 0) {
          throw new SpeakingTranscriptError(
            422,
            "TRANSCRIPT_EMPTY",
            "Không nghe được lời nói trong âm thanh."
          );
        }
      },
    }, deps.ai);

    return {
      text: result.data.text,
      source: "gemini",
      ...(usageLogId === undefined ? {} : { usageLogId }),
    };
  } catch (error) {
    if (
      error instanceof SpeakingTranscriptError
      || error instanceof AIQuotaExceededError
      || error instanceof AIInvalidFormatError
    ) {
      throw error;
    }

    if (error instanceof AIServiceError && error.code !== "AI_ERROR") {
      throw error;
    }

    throw new AIServiceError(
      "AI_UNAVAILABLE",
      error instanceof AIServiceError ? error.attempts : 0
    );
  }
}