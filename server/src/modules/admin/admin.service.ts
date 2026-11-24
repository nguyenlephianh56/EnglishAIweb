import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ListUsersQuery } from "./admin.schema";

//kiểm tra điều kiện rồi mới đọc/ghi DB. Controller
// Các trường được phép trả về. KHÔNG có passwordHash.
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

// Hàm tạo lỗi có mã trạng thái, controller sẽ đọc statusCode + code
const createError = (message: string, statusCode: number, code: string) =>
  Object.assign(new Error(message), { statusCode, code });

// Lấy user theo id, không có thì báo 404
const findUserOrThrow = async (tx: Prisma.TransactionClient, id: number) => {
  // Giữ trạng thái đọc được ổn định cho đến khi đổi trạng thái và ghi audit.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR NO KEY UPDATE`;
  const user = await tx.user.findUnique({
    where: { id },
    select: userSelect,
  });

  if (!user) {
    throw createError("Không tìm thấy tài khoản", 404, "USER_NOT_FOUND");
  }

  return user;
};

async function updateStatusWithAudit(
  tx: Prisma.TransactionClient,
  adminId: number,
  user: { id: number; status: UserStatus },
  to: UserStatus,
  action: "user.approve" | "user.lock" | "user.unlock"
) {
  const updated = await tx.user.update({
    where: { id: user.id },
    data: { status: to },
    select: userSelect,
  });

  await tx.auditLog.create({
    data: {
      userId: adminId,
      action,
      detail: { target_user_id: user.id, from: user.status, to },
    },
  });

  return updated;
}

// Escape cho mẫu LIKE/ILIKE của PostgreSQL: biến %, _ và dấu \ thành ký tự thường.
// Lý do: Prisma `contains` KHÔNG tự escape (đã kiểm bằng test DB): q=% hoặc q=_ sẽ khớp mọi dòng,
// còn q=\ bị hiểu là ký tự escape nên không khớp gì. PostgreSQL mặc định dùng dấu \ làm
// ký tự escape của LIKE, nên đặt \ trước mỗi ký tự đặc biệt là đủ.
// Giá trị vẫn đi qua tham số của câu SQL, không nối chuỗi vào SQL.
const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, "\\$&");

// Danh sách tài khoản, lọc theo role/status/q nếu có (các điều kiện kết hợp AND).
// q: tìm không phân biệt hoa/thường, khớp một phần trên name HOẶC email, ký tự đặc biệt khớp nghĩa đen.
export const listUsers = async (query: ListUsersQuery) => {
  return prisma.user.findMany({
    where: {
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        OR: [
          { name: { contains: escapeLikePattern(query.q), mode: "insensitive" } },
          { email: { contains: escapeLikePattern(query.q), mode: "insensitive" } },
        ],
      }),
    },
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });
};

// Duyệt giáo viên: PENDING -> ACTIVE
export const approveTeacher = async (id: number, adminId: number) => {
  return prisma.$transaction(async (tx) => {
    const user = await findUserOrThrow(tx, id);

    if (user.role !== Role.TEACHER) {
      throw createError(
        "Chỉ có thể duyệt tài khoản giáo viên",
        400,
        "NOT_A_TEACHER"
      );
    }

    if (user.status !== UserStatus.PENDING) {
      throw createError(
        "Tài khoản này không ở trạng thái chờ duyệt",
        409,
        "INVALID_STATUS"
      );
    }

    return updateStatusWithAudit(tx, adminId, user, UserStatus.ACTIVE, "user.approve");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
};

// Khóa tài khoản: ACTIVE -> LOCKED
export const lockUser = async (id: number, adminId: number) => {
  if (id === adminId) {
    throw createError(
      "Bạn không thể tự khóa tài khoản của mình",
      400,
      "CANNOT_LOCK_SELF"
    );
  }

  return prisma.$transaction(async (tx) => {
    const user = await findUserOrThrow(tx, id);

    if (user.role === Role.ADMIN) {
      throw createError(
        "Không thể khóa tài khoản quản trị viên",
        403,
        "CANNOT_LOCK_ADMIN"
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw createError(
        "Chỉ có thể khóa tài khoản đang hoạt động",
        409,
        "INVALID_STATUS"
      );
    }

    return updateStatusWithAudit(tx, adminId, user, UserStatus.LOCKED, "user.lock");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
};

// Mở khóa tài khoản: LOCKED -> ACTIVE
export const unlockUser = async (id: number, adminId: number) => {
  return prisma.$transaction(async (tx) => {
    const user = await findUserOrThrow(tx, id);

    if (user.status !== UserStatus.LOCKED) {
      throw createError(
        "Tài khoản này không bị khóa",
        409,
        "INVALID_STATUS"
      );
    }

    return updateStatusWithAudit(tx, adminId, user, UserStatus.ACTIVE, "user.unlock");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
};