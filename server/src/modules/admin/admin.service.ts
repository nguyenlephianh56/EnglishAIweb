import { Role, UserStatus } from "@prisma/client";
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
const findUserOrThrow = async (id: number) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
  });

  if (!user) {
    throw createError("Không tìm thấy tài khoản", 404, "USER_NOT_FOUND");
  }

  return user;
};

// Danh sách tài khoản, lọc theo role/status nếu có
export const listUsers = async (query: ListUsersQuery) => {
  return prisma.user.findMany({
    where: {
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
    },
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });
};

// Duyệt giáo viên: PENDING -> ACTIVE
export const approveTeacher = async (id: number) => {
  const user = await findUserOrThrow(id);

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

  return prisma.user.update({
    where: { id },
    data: { status: UserStatus.ACTIVE },
    select: userSelect,
  });
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

  const user = await findUserOrThrow(id);

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

  return prisma.user.update({
    where: { id },
    data: { status: UserStatus.LOCKED },
    select: userSelect,
  });
};

// Mở khóa tài khoản: LOCKED -> ACTIVE
export const unlockUser = async (id: number) => {
  const user = await findUserOrThrow(id);

  if (user.status !== UserStatus.LOCKED) {
    throw createError(
      "Tài khoản này không bị khóa",
      409,
      "INVALID_STATUS"
    );
  }

  return prisma.user.update({
    where: { id },
    data: { status: UserStatus.ACTIVE },
    select: userSelect,
  });
};