// =====================================================================
// admin.users.detail.ts — HÀM THUẦN dựng response cho GET /admin/users/:id (T29, việc "Xem").
//
// "Thuần" nghĩa là: không đụng DB, không đọc giờ hệ thống, không đọc env.
// Cùng đầu vào luôn ra cùng kết quả => rất dễ test.
// Việc đếm số liệu bằng DB nằm ở admin.users.detail.service.ts.
// =====================================================================
import type { Role, UserStatus } from "@prisma/client";

/** Hồ sơ user lấy từ DB. Chỉ cần đúng các field này (KHÔNG có passwordHash). */
export interface AdminUserProfile {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
}

/** Số liệu thô do service đếm từ DB. */
export interface AdminUserStatsInput {
  classesTeaching: number; // lớp có teacher_id = id
  classesJoined: number; // dòng class_members có student_id = id
  attemptsCount: number; // bài nộp (attempts) của user
  exercisesCreated: number; // bài tập có created_by_id = id
  aiTotal: number; // mọi dòng ai_usage_logs của user, bất kể status
  aiToday: number; // như aiTotal nhưng chỉ trong ngày VN hiện tại (cùng mốc với giới hạn lượt AI)
  lastAttemptAt: Date | null; // max(attempts.submitted_at), null nếu chưa nộp bài nào
  lastAiAt: Date | null; // max(ai_usage_logs.created_at), null nếu chưa dùng AI
}

/** Dạng response của GET /admin/users/:id (camelCase, giống GET /admin/users). */
export interface AdminUserDetail extends AdminUserProfile {
  stats: {
    classesTeaching: number;
    classesJoined: number;
    attemptsCount: number;
    exercisesCreated: number;
    aiRequests: { total: number; today: number };
    lastActivityAt: Date | null;
  };
}

const isValidDate = (value: Date | null): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Chọn "lần hoạt động gần nhất" = ngày lớn hơn giữa lần nộp bài gần nhất và lượt AI gần nhất.
 * - Một giá trị null (hoặc không hợp lệ) thì lấy giá trị còn lại.
 * - Cả hai null thì trả null.
 *
 * LƯU Ý: DB KHÔNG lưu lần đăng nhập, nên đây KHÔNG phải "lần đăng nhập gần nhất".
 * Nó chỉ là dấu vết hoạt động học tập/AI gần nhất mà hệ thống ghi lại được.
 */
export function pickLastActivityAt(lastAttemptAt: Date | null, lastAiAt: Date | null): Date | null {
  const a = isValidDate(lastAttemptAt) ? lastAttemptAt : null;
  const b = isValidDate(lastAiAt) ? lastAiAt : null;
  if (a === null) return b;
  if (b === null) return a;
  return b.getTime() > a.getTime() ? b : a; // bằng nhau thì cùng một thời điểm, lấy a
}

/**
 * Ghép hồ sơ + số liệu thành response.
 * Cố ý chép TỪNG field theo tên (không dùng ...user) để dù hàng DB có thừa field
 * (vd passwordHash do ai đó sửa select nhầm) thì cũng không lọt ra response.
 */
export function buildAdminUserDetail(
  user: AdminUserProfile,
  stats: AdminUserStatsInput
): AdminUserDetail {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    stats: {
      classesTeaching: stats.classesTeaching,
      classesJoined: stats.classesJoined,
      attemptsCount: stats.attemptsCount,
      exercisesCreated: stats.exercisesCreated,
      aiRequests: { total: stats.aiTotal, today: stats.aiToday },
      lastActivityAt: pickLastActivityAt(stats.lastAttemptAt, stats.lastAiAt),
    },
  };
}