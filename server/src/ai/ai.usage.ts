// =====================================================================
// ai/ai.usage.ts — Cổng đếm lượt + cổng ghi log (bản Prisma) cho ai.service.ts (T9).
//
// - Ngày tính theo GIỜ VIỆT NAM (00:00 Asia/Ho_Chi_Minh). DB lưu UTC nên phải quy đổi.
//   Việt Nam là UTC+7 cố định, không có giờ mùa hè -> chỉ cần cộng/trừ 7 giờ.
// - "Lượt đã dùng" = số dòng ai_usage_logs của user trong ngày VN, status `ok` + `error`.
//   `cached` và `rate_limited` KHÔNG tính.
// - Đây là giới hạn MỀM: 2 request song song cùng lúc có thể vượt nhẹ (không có khóa/UNIQUE).
// - Log DB chỉ có: user_id, task, status, tokens. Không bao giờ có prompt/bài làm/phản hồi.
//
// `countAiUsageToday` được export riêng để middleware `aiRateLimit` (việc sau) dùng lại.
// File này không đọc env: giới hạn theo vai trò nằm ở ai.usage.config.ts.
// =====================================================================
import { prisma } from "../config/prisma";
import type {
  AiUsageCounter,
  AiUsageLogEntry,
  AiUsageLogger,
  AiUsageStatus,
} from "./ai.types";

// ---------------------------------------------------------------------
// Mốc ngày giờ Việt Nam
// ---------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Việt Nam = UTC+7. */
const VN_OFFSET_MS = 7 * HOUR_MS;

/** Thời điểm 00:00 (giờ VN) của ngày chứa `now`, trả về dưới dạng thời điểm UTC. */
export function vnDayStart(now: Date): Date {
  const vnMs = now.getTime() + VN_OFFSET_MS; // "đồng hồ" VN, coi như UTC
  const startOfVnDay = vnMs - (((vnMs % DAY_MS) + DAY_MS) % DAY_MS);
  return new Date(startOfVnDay - VN_OFFSET_MS);
}

/** 00:00 (giờ VN) của ngày KẾ TIẾP (mốc kết thúc, không tính). */
export function vnNextDayStart(now: Date): Date {
  return new Date(vnDayStart(now).getTime() + DAY_MS);
}

// ---------------------------------------------------------------------
// Kiểu "DB tối thiểu" để test bằng DB giả (PrismaClient thật gán vào được)
// ---------------------------------------------------------------------

/** Trạng thái được tính vào lượt. */
const COUNTED_STATUSES: AiUsageStatus[] = ["ok", "error"];

export interface AiUsageDb {
  aiUsageLog: {
    count(args: {
      where: {
        userId: number;
        status: { in: string[] };
        createdAt: { gte: Date; lt: Date };
      };
    }): Promise<number>;
    create(args: {
      data: { userId: number; task: string; status: string; tokens: number | null };
    }): Promise<unknown>;
  };
}

// ---------------------------------------------------------------------
// Đếm lượt
// ---------------------------------------------------------------------

/**
 * Số lượt AI user đã dùng trong ngày (giờ VN) chứa `now`.
 * Middleware aiRateLimit sau này gọi hàm này.
 */
export async function countAiUsageToday(
  userId: number,
  now: Date = new Date(),
  db: AiUsageDb = prisma
): Promise<number> {
  return db.aiUsageLog.count({
    where: {
      userId,
      status: { in: COUNTED_STATUSES },
      createdAt: { gte: vnDayStart(now), lt: vnNextDayStart(now) },
    },
  });
}

/** Cổng AiUsageCounter bản Prisma. */
export function createPrismaUsageCounter(db: AiUsageDb = prisma): AiUsageCounter {
  return {
    countUsedToday: (userId, now) => countAiUsageToday(userId, now, db),
  };
}

// ---------------------------------------------------------------------
// Ghi log
// ---------------------------------------------------------------------

/**
 * Cổng AiUsageLogger bản Prisma: ghi đúng 1 dòng ai_usage_logs.
 * CỐ Ý không bắt lỗi ở đây: ai.service.ts quyết định "log lỗi thì không làm hỏng kết quả AI".
 * Chỉ ghi 4 trường, dù entry có truyền thừa gì thì cũng không được ghi.
 */
export function createPrismaUsageLogger(db: AiUsageDb = prisma): AiUsageLogger {
  return {
    async log(entry: AiUsageLogEntry): Promise<void> {
      await db.aiUsageLog.create({
        data: {
          userId: entry.userId,
          task: entry.task,
          status: entry.status,
          tokens: entry.tokens,
        },
      });
    },
  };
}

/**
 * Gộp token provider báo ({input, output}) thành 1 số nguyên cho cột `tokens`.
 * Provider không báo gì -> null.
 */
export function sumTokens(tokens?: { input?: number; output?: number }): number | null {
  if (!tokens) return null;
  const { input, output } = tokens;
  if (input === undefined && output === undefined) return null;
  return (input ?? 0) + (output ?? 0);
}

// ---------------------------------------------------------------------
// Giới hạn theo vai trò
// ---------------------------------------------------------------------

export type AiRole = "STUDENT" | "TEACHER" | "ADMIN";

export interface AiDailyLimits {
  student: number;
  teacher: number;
}

/** STUDENT -> mức học sinh; TEACHER và ADMIN -> mức giáo viên (chưa có mức riêng cho admin). */
export function dailyLimitForRole(role: AiRole, limits: AiDailyLimits): number {
  return role === "STUDENT" ? limits.student : limits.teacher;
}