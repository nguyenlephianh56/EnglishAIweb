import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { RevokeAdminBody } from "./admin.users-role.schema";

// Khóa chung cho các transaction thay đổi vai trò ADMIN.
const ADMIN_ROLE_LOCK_KEY = 29_000_001;

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

const createError = (message: string, statusCode: number, code: string) =>
  Object.assign(new Error(message), { statusCode, code });

function withAdminRoleLock<T>(adminId: number, run: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_ROLE_LOCK_KEY}::bigint)`;

      const actor = await tx.user.findUnique({
        where: { id: adminId },
        select: { role: true, status: true },
      });
      if (actor?.role !== Role.ADMIN || actor.status !== UserStatus.ACTIVE) {
        throw createError("Bạn không có quyền truy cập chức năng này", 403, "FORBIDDEN");
      }

      return run(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}

async function findRoleTarget(tx: Prisma.TransactionClient, id: number) {
  const target = await tx.user.findUnique({
    where: { id },
    select: { role: true, status: true },
  });
  if (!target) {
    throw createError("Không tìm thấy tài khoản", 404, "USER_NOT_FOUND");
  }
  return target;
}

async function updateRoleWithAudit(
  tx: Prisma.TransactionClient,
  adminId: number,
  where: { id: number; role: Role; status?: UserStatus },
  to: Role,
  action: "user.promote_admin" | "user.revoke_admin"
) {
  const { count } = await tx.user.updateMany({ where, data: { role: to } });
  if (count === 0) {
    throw createError("Tài khoản vừa thay đổi. Vui lòng thử lại", 409, "USER_ROLE_CONFLICT");
  }

  const updated = await tx.user.findUniqueOrThrow({ where: { id: where.id }, select: userSelect });
  await tx.auditLog.create({
    data: {
      userId: adminId,
      action,
      detail: { target_user_id: where.id, from: where.role, to },
    },
  });
  return updated;
}

export async function promoteAdmin(adminId: number, id: number) {
  return withAdminRoleLock(adminId, async (tx) => {
    const target = await findRoleTarget(tx, id);
    if (target.role === Role.ADMIN) {
      throw createError("Tài khoản đã là quản trị viên", 409, "USER_ALREADY_ADMIN");
    }
    if (target.status === UserStatus.PENDING) {
      throw createError("Tài khoản đang chờ duyệt", 409, "INVALID_STATUS");
    }
    if (target.status === UserStatus.LOCKED) {
      throw createError("Tài khoản đang bị khóa", 409, "INVALID_STATUS");
    }

    return updateRoleWithAudit(
      tx, adminId, { id, role: target.role, status: UserStatus.ACTIVE }, Role.ADMIN, "user.promote_admin"
    );
  });
}

export async function revokeAdmin(adminId: number, id: number, to: RevokeAdminBody["role"]) {
  return withAdminRoleLock(adminId, async (tx) => {
    const target = await findRoleTarget(tx, id);
    if (id === adminId) {
      throw createError("Bạn không thể tự thu hồi quyền quản trị của mình", 409, "CANNOT_REVOKE_SELF");
    }
    if (target.role !== Role.ADMIN) {
      throw createError("Tài khoản không phải là quản trị viên", 409, "USER_NOT_ADMIN");
    }

    if (to === Role.STUDENT) {
      const ownedClass = await tx.class.findFirst({ where: { teacherId: id }, select: { id: true } });
      if (ownedClass) {
        throw createError(
          "Không thể chuyển thành học sinh vì tài khoản đang là chủ lớp",
          409,
          "USER_OWNS_CLASSES"
        );
      }
    }

    const remaining = await tx.user.count({
      where: { id: { not: id }, role: Role.ADMIN, status: UserStatus.ACTIVE },
    });
    if (remaining < 1) {
      throw createError("Phải còn ít nhất một quản trị viên đang hoạt động", 409, "LAST_ACTIVE_ADMIN");
    }

    return updateRoleWithAudit(tx, adminId, { id, role: Role.ADMIN }, to, "user.revoke_admin");
  });
}