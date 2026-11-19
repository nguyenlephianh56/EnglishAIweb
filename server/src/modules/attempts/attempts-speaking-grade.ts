// =====================================================================
// attempts/attempts-speaking-grade.ts — Chấm AI cho MỘT attempt speaking đã lưu (T18).
//
// gradeSpeakingAttempt(target): song song với gradeWritingAttempt (T13):
//   1. gọi gradeSpeaking (server tự lấy userId/đề; bản chữ đi từ bước lấy bản chữ cùng lần nộp);
//   2. ghi score + ai_feedback + errors vào đúng dòng attempt bằng updateMany có điều kiện
//      (where id AND score IS NULL): một attempt chỉ được ghi MỘT lần, request chậm hơn không ghi đè.
//
// ai_feedback = { criteria:{content,fluency,pronunciation}, comment, wordIssues }, chọn TỪNG field
// (không lưu transcript: bản chữ đã nằm ở attempts.answer.text).
// Hàm này KHÔNG bắt lỗi AI: lỗi ném nguyên vẹn ra ngoài; attempt đã lưu từ trước nên giữ score = NULL.
// Gộp log (câu d): nếu bản chữ do Gemini chữ hóa, transcript.usageLogId khiến gradeSpeaking cập nhật
// CHÍNH dòng ai_usage_logs của bước chữ hóa (không tạo dòng thứ hai, không kiểm lượt lần nữa).
// Không log bản chữ, ai_feedback, errors, phản hồi thô.
// =====================================================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { gradeSpeaking } from "../../ai/speakingGrader";
import type { SpeakingTranscriptResult } from "../../ai/speakingTranscript";

export interface SpeakingGradeTarget {
  attemptId: number;
  /** Từ token (req.user) hoặc từ attempt của chính HS, không từ body. */
  userId: number;
  /** exercise.content đã lấy từ DB. */
  content: unknown;
  /** Kết quả bước lấy bản chữ của cùng lần nộp (text đã trim). */
  transcript: SpeakingTranscriptResult;
}

export interface SpeakingGradeSaved {
  /** true = lần gọi này là lần GHI điểm (thắng); false = đã có lần chấm khác ghi trước. */
  written: boolean;
  score: number | null;
  errors: unknown;
  /** {criteria, comment, wordIssues} đúng như đang lưu trong DB. */
  aiFeedback: unknown;
}

export const gradeSpeakingAttempt = async (
  target: SpeakingGradeTarget
): Promise<SpeakingGradeSaved> => {
  const graded = await gradeSpeaking({
    studentId: target.userId,
    content: target.content,
    transcript: target.transcript,
  });

  const aiFeedback = {
    criteria: graded.criteria,
    comment: graded.comment,
    wordIssues: graded.wordIssues,
  };

  const written = await prisma.attempt.updateMany({
    where: { id: target.attemptId, score: null }, // score IS NULL: chưa ai chấm
    data: {
      score: graded.score,
      aiFeedback: aiFeedback as unknown as Prisma.InputJsonValue,
      errors: graded.errors as unknown as Prisma.InputJsonValue,
    },
  });

  if (written.count === 1) {
    return { written: true, score: graded.score, errors: graded.errors, aiFeedback };
  }
  // Đã có lần chấm khác ghi trước: KHÔNG ghi đè, trả đúng dữ liệu đang lưu trong DB.
  const stored = await prisma.attempt.findUniqueOrThrow({
    where: { id: target.attemptId },
    select: { score: true, errors: true, aiFeedback: true },
  });
  return {
    written: false,
    score: stored.score,
    errors: stored.errors,
    aiFeedback: stored.aiFeedback,
  };
};