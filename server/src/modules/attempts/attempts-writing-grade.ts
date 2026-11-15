// =====================================================================
// attempts/attempts-writing-grade.ts — Chấm AI cho MỘT attempt writing đã lưu (T13).
//
// gradeWritingAttempt(target):
//   1. gọi gradeWriting (server tự lấy userId/role/đề/level, KHÔNG nhận gì từ client);
//   2. điểm tổng = computeWritingScore(criteria);
//   3. ghi score + ai_feedback + errors vào đúng dòng attempt bằng updateMany có điều kiện
//      (where id AND score IS NULL): một attempt chỉ được ghi MỘT lần, request chậm hơn
//      không ghi đè. Không cần khóa/cột mới trong DB.
//
// Hàm này KHÔNG bắt lỗi AI: lỗi (hết lượt, sai khuôn, timeout...) ném nguyên vẹn ra ngoài;
// attempt đã lưu từ trước nên giữ nguyên score = NULL (không mất bài làm).
// Không log bài viết, ai_feedback, errors, phản hồi thô.
// =====================================================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { gradeWriting } from "../../ai/writingGrader";
import type { AiRole } from "../../ai/ai.usage";
import { computeWritingScore } from "../grading/writingScore";

export interface WritingGradeTarget {
  attemptId: number;
  /** Từ token (req.user), không từ body. */
  userId: number;
  role: AiRole;
  /** Bài viết đã qua writingAnswerSchema (đã trim). */
  text: string;
  exercise: { level: string; content: unknown };
}

export interface WritingGradeSaved {
  score: number | null;
  errors: unknown;
}

/** Đề bài + số từ tối thiểu từ exercise.content ({prompt, minWords}); thiếu thì dùng giá trị an toàn. */
const readWritingContent = (content: unknown): { prompt: string; minWords: number } => {
  const c =
    typeof content === "object" && content !== null
      ? (content as Record<string, unknown>)
      : {};
  const minWords =
    typeof c.minWords === "number" && Number.isInteger(c.minWords) && c.minWords >= 0
      ? c.minWords
      : 0;
  return { prompt: typeof c.prompt === "string" ? c.prompt : "", minWords };
};

export const gradeWritingAttempt = async (
  target: WritingGradeTarget
): Promise<WritingGradeSaved> => {
  const { prompt, minWords } = readWritingContent(target.exercise.content);

  const graded = await gradeWriting({
    userId: target.userId,
    role: target.role,
    text: target.text,
    prompt,
    minWords,
    level: target.exercise.level,
  });

  const score = computeWritingScore(graded.criteria);

  const written = await prisma.attempt.updateMany({
    where: { id: target.attemptId, score: null }, // score IS NULL: chưa ai chấm
    data: {
      score,
      aiFeedback: {
        criteria: graded.criteria,
        comment: graded.comment,
      } as unknown as Prisma.InputJsonValue,
      errors: graded.errors as unknown as Prisma.InputJsonValue,
    },
  });

  if (written.count === 1) return { score, errors: graded.errors };

  // Đã có lần chấm khác ghi trước: KHÔNG ghi đè, trả đúng dữ liệu đang lưu trong DB.
  const stored = await prisma.attempt.findUniqueOrThrow({
    where: { id: target.attemptId },
    select: { score: true, errors: true },
  });
  return { score: stored.score, errors: stored.errors };
};