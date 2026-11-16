/**
 * T14 - Tính lại hồ sơ kỹ năng của 1 học sinh cho 1 kỹ năng.
 *
 * Luôn tính lại từ DB (không cộng dồn lên giá trị cũ), rồi upsert đúng 1 dòng
 * skill_profiles(student_id, skill).
 *
 * Hạn chế đã biết:
 * - Chỉ đọc tối đa MAX_ATTEMPTS_READ attempt gần nhất của kỹ năng; bài rất cũ có thể
 *   mất attempt điểm cao nhất, và attempt chưa chấm vẫn chiếm chỗ trong giới hạn này.
 * - skill_profiles.score là NOT NULL nên khi không còn điểm hợp lệ, hàm KHÔNG ghi gì:
 *   chưa có dòng thì không tạo, đã có dòng thì giữ nguyên dòng cũ (T15 cần xử lý hiển thị).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../../config/env";
import { fetchSkillAttempts } from "./skill-profiles.attempts";
import { mergeErrorStats } from "./skill-profiles.errors";
import { scoreToLevel } from "./skill-profiles.level";
import { selectRepresentativeAttempts } from "./skill-profiles.representative";
import { calcProfileScore } from "./skill-profiles.score";

type StudentId = Parameters<typeof fetchSkillAttempts>[1];
type SkillKey = Parameters<typeof fetchSkillAttempts>[2];

export type RecomputeOptions = { windowSize?: number };

function resolveWindowSize(opts?: RecomputeOptions): number {
  const n = opts?.windowSize ?? env.SKILL_WINDOW_SIZE;
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError("windowSize phải là số nguyên >= 1");
  }
  return n;
}

export async function recomputeSkillProfile(
  db: Prisma.TransactionClient | PrismaClient,
  studentId: StudentId,
  skill: SkillKey,
  opts?: RecomputeOptions,
) {
  const windowSize = resolveWindowSize(opts);
  const progress = { attempts: 0 };

  const run = async (tx: Prisma.TransactionClient) => {
    // 1. Khóa TRƯỚC khi đọc attempt, tự nhả khi transaction kết thúc.
    //    Dùng $executeRaw vì hàm trả void, $queryRaw có thể lỗi khi đọc kiểu void.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${studentId}::int, hashtext(${"skill_profiles:" + skill}::text))`;

    // 2. Đọc, chọn attempt đại diện, lấy cửa sổ N gần nhất.
    const rows = await fetchSkillAttempts(tx, studentId, skill);
    progress.attempts = rows.length;
    const reps = selectRepresentativeAttempts(rows);
    const window = reps.slice(0, windowSize);

    // 3. Điểm, mức, thống kê lỗi cùng một tập attempt.
    // Điểm của mỗi bài = COALESCE(teacher_score, score). window đã bỏ attempt không có điểm hợp lệ.
    const windowScores = window.map((a) => a.teacherScore ?? a.score);
    const score = calcProfileScore(windowScores, windowSize);
    if (score === null) return null; // không có điểm hợp lệ: không ghi gì (câu (c))

    const level = scoreToLevel(score, window.length);
    const errorStats = mergeErrorStats(window);

    // 4. Upsert đúng 1 dòng.
    return tx.skillProfile.upsert({
      where: { studentId_skill: { studentId, skill } },
      create: { studentId, skill, score, level, errorStats, updatedAt: new Date() },
      update: { score, level, errorStats, updatedAt: new Date() },
    });
  };

  try {
    // Đã ở trong transaction thì dùng lại, không lồng thêm.
    if (typeof (db as PrismaClient).$transaction === "function") {
      return await (db as PrismaClient).$transaction(async (tx) => run(tx));
    }
    return await run(db as Prisma.TransactionClient);
  } catch (err) {
    // Chỉ log studentId, skill, số attempt. Không log errors hay nội dung bài.
    console.error("recomputeSkillProfile failed", {
      studentId,
      skill,
      attempts: progress.attempts,
    });
    throw err;
  }
}