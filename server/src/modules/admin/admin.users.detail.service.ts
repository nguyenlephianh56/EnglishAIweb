// =====================================================================
// admin.users.detail.service.ts — truy vấn số liệu cho GET /admin/users/:id (T29, việc "Xem").
//
// - CHỈ ĐỌC: không ghi DB, không ghi audit_logs, không khóa dòng (khác findUserOrThrow
//   của admin.service.ts vốn khóa dòng để phục vụ thao tác ghi).
// - Số truy vấn CỐ ĐỊNH, không phụ thuộc số bản ghi:
//     1 truy vấn tìm user, rồi 8 truy vấn đếm/lấy ngày lớn nhất chạy SONG SONG (Promise.all).
//   Không findMany rồi đếm trong bộ nhớ.
// - Mốc "hôm nay" tái dùng vnDayStart/vnNextDayStart của ai.usage.ts (cùng mốc với giới hạn
//   lượt AI, giờ Việt Nam UTC+7), không viết bản thứ hai.
// - Service chỉ nhận `id` do controller đã kiểm bằng userIdParamSchema.
// =====================================================================
import { prisma } from "../../config/prisma";
import { vnDayStart, vnNextDayStart } from "../../ai/ai.usage";
import { buildAdminUserDetail, type AdminUserDetail } from "./admin.users.detail";

// Các field được phép trả về. KHÔNG có passwordHash.
const profileSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

// Cùng dạng lỗi với các endpoint admin hiện có (controller đọc statusCode + code).
const userNotFound = () =>
  Object.assign(new Error("Không tìm thấy tài khoản"), {
    statusCode: 404,
    code: "USER_NOT_FOUND",
  });

/**
 * Hồ sơ + số liệu của một user. Không tồn tại thì ném 404 USER_NOT_FOUND.
 *
 * `now` cho phép test cố định thời điểm để kiểm tra biên "hôm nay".
 * Gọi thật thì để mặc định (giờ hiện tại).
 *
 * `aiRequests.total` và `aiRequests.today` đếm MỌI dòng ai_usage_logs bất kể `status`
 * (ok, error, cached, rate_limited...). Vì vậy `today` có thể lớn hơn "số lượt đã tính vào
 * giới hạn", vì giới hạn chỉ tính ok + error (xem countAiUsageToday trong ai.usage.ts).
 *
 * `lastActivityAt` = max(bài nộp gần nhất, lượt AI gần nhất). Đây KHÔNG phải lần đăng nhập.
 */
export async function getAdminUserDetail(
  id: number,
  now: Date = new Date(),
  db: typeof prisma = prisma
): Promise<AdminUserDetail> {
  const user = await db.user.findUnique({ where: { id }, select: profileSelect });
  if (!user) throw userNotFound();

  const dayStart = vnDayStart(now);
  const nextDayStart = vnNextDayStart(now);

  const [
    classesTeaching,
    classesJoined,
    attemptsCount,
    lastAttempt,
    exercisesCreated,
    aiTotal,
    aiToday,
    lastAi,
  ] = await Promise.all([
    db.class.count({ where: { teacherId: id } }),
    db.classMember.count({ where: { studentId: id } }),
    db.attempt.count({ where: { studentId: id } }),
    db.attempt.aggregate({ where: { studentId: id }, _max: { submittedAt: true } }),
    db.exercise.count({ where: { createdById: id } }),
    db.aiUsageLog.count({ where: { userId: id } }),
    db.aiUsageLog.count({
      where: { userId: id, createdAt: { gte: dayStart, lt: nextDayStart } },
    }),
    db.aiUsageLog.aggregate({ where: { userId: id }, _max: { createdAt: true } }),
  ]);

  return buildAdminUserDetail(user, {
    classesTeaching,
    classesJoined,
    attemptsCount,
    exercisesCreated,
    aiTotal,
    aiToday,
    lastAttemptAt: lastAttempt._max.submittedAt,
    lastAiAt: lastAi._max.createdAt,
  });
}