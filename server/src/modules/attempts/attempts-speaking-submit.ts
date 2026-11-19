// =====================================================================
// attempts/attempts-speaking-submit.ts — Chuẩn bị lần nộp bài NÓI trước khi lưu attempt (T18).
//
// prepareSpeakingAttempt: chạy SAU bước kiểm quyền/lượt (resolveSubmitTarget), TRƯỚC khi lưu attempt:
//   1. kiểm hình dạng request { audio_id } | { transcript } (400, chưa tốn gì);
//   2. kiểm đề (exercise.content) đủ khuôn để chấm (422), để khỏi lưu bài rồi mới phát hiện đề hỏng;
//   3. lấy bản chữ: transcript của FE (không gọi AI) hoặc audio_id -> file của CHÍNH HS -> Gemini;
//   4. kiểm bản chữ: tối thiểu số từ, tối đa số ký tự (422), rồi trả { text } đã trim.
// Lỗi ở bất kỳ bước nào thì ném ra NGAY: chưa có attempt, không tính vào 3 lần.
// Kết quả KHÔNG chứa audio_id/đường dẫn: chỉ { text } sẽ được lưu vào attempts.answer.
// Không log bản chữ, prompt, đường dẫn file; thông báo lỗi không chép lại nội dung.
// =====================================================================
import { SPEAKING_MIN_TRANSCRIPT_WORDS } from "../../ai/speaking.constants";
import {
  getSpeakingTranscript,
  type SpeakingTranscriptResult,
} from "../../ai/speakingTranscript";
import { tokenizeSpeakingWords } from "../../ai/speakingWords";
import { speakingContentSchema } from "../exercises/exercise-content.schema";
import { SPEAKING_MAX_SCORE } from "./attempts.constants";
import {
  speakingAttemptAnswerSchema,
  speakingSubmitRequestSchema,
  type SpeakingAttemptAnswer,
} from "./attempts.schema";

const businessError = (statusCode: number, code: string, message: string) =>
  Object.assign(new Error(message), { statusCode, code });

/** Điều service cần để lưu một lần nộp speaking (khớp khuôn PreparedAttempt của attempts.service). */
export interface PreparedSpeakingAttempt {
  answer: SpeakingAttemptAnswer;
  score: null;
  maxScore: number;
  errors: never[];
  /** Bản chữ + nguồn (+ usageLogId nếu Gemini chữ hóa), để bước chấm dùng lại. KHÔNG lưu vào DB. */
  speakingTranscript: SpeakingTranscriptResult;
}

/** Cổng để test: thay hàm lấy bản chữ bằng bản giả. Chạy thật thì bỏ trống. */
export interface PrepareSpeakingDeps {
  getTranscript?: typeof getSpeakingTranscript;
}

export const prepareSpeakingAttempt = async (
  studentId: number,
  exerciseContent: unknown,
  rawAnswer: unknown,
  deps: PrepareSpeakingDeps = {}
): Promise<PreparedSpeakingAttempt> => {
  // 1. Hình dạng request. Lỗi chỉ nêu field sai, không chép lại nội dung.
  const request = speakingSubmitRequestSchema.safeParse(rawAnswer);
  if (!request.success) {
    const detail = request.error.issues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join("; ");
    throw businessError(400, "VALIDATION_ERROR", `Bài làm không hợp lệ: ${detail}`);
  }

  // 2. Đề phải đủ khuôn để chấm (dữ liệu từ DB, không phải từ client).
  if (!speakingContentSchema.safeParse(exerciseContent).success) {
    throw businessError(
      422,
      "EXERCISE_CONTENT_INVALID",
      "Đề bài Nói chưa đủ thông tin để chấm. Vui lòng báo giáo viên."
    );
  }

  // 3. Lấy bản chữ. Lỗi (không thấy file, Gemini bận/hết lượt/sai khuôn...) ném nguyên vẹn,
  //    controller đã đổi sang response chuẩn (statusCode + code). Chưa lưu gì.
  const getTranscript = deps.getTranscript ?? getSpeakingTranscript;
  const transcript = await getTranscript({ studentId, ...request.data });

  // 4. Kiểm bản chữ (cả nguồn FE lẫn Gemini). Chưa tới bước chấm nên chưa tốn lượt chấm.
  if (tokenizeSpeakingWords(transcript.text).length < SPEAKING_MIN_TRANSCRIPT_WORDS) {
    throw businessError(
      422,
      "TRANSCRIPT_TOO_SHORT",
      `Bản chữ cần ít nhất ${SPEAKING_MIN_TRANSCRIPT_WORDS} từ. Bạn hãy nói dài hơn rồi nộp lại.`
    );
  }
  const answer = speakingAttemptAnswerSchema.safeParse({ text: transcript.text });
  if (!answer.success) {
    throw businessError(
      422,
      "TRANSCRIPT_TOO_LONG",
      "Bản chữ quá dài để chấm. Bạn hãy nói ngắn gọn hơn rồi nộp lại."
    );
  }

  return {
    answer: answer.data,
    score: null,
    maxScore: SPEAKING_MAX_SCORE,
    errors: [],
    speakingTranscript: { ...transcript, text: answer.data.text },
  };
};