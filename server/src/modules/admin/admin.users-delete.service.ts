import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  anonymizedUserEmail,
  anonymizeUserWithAudit,
  createAnonymizedPasswordHash,
} from "./admin.users-delete.anonymize";
import { hasUserRelatedData } from "./admin.users-delete.related-data";

type DeleteTarget = { id: number; role: Role; email: string };
type DeleteResult = { id: number; mode: "deleted" | "anonymized" };

const createError = (message: string, statusCode: number, code: string) =>
  Object.assign(new Error(message), { statusCode, code });

const userNotFound = () => createError("Không tìm thấy tài khoản", 404, "USER_NOT_FOUND");

async function requireActiveAdmin(client: Pick<Prisma.TransactionClient, "user">, adminId: number) {
  const admin = await client.user.findUnique({
    where: { id: adminId },
    select: { role: true, status: true },
  });
  if (admin?.role !== Role.ADMIN || admin.status !== UserStatus.ACTIVE) {
    throw createError("Bạn không có quyền truy cập chức năng này", 403, "FORBIDDEN");
  }
}

function requireDeletableTarget(target: DeleteTarget | null | undefined, adminId: number): DeleteTarget {
  if (!target) throw userNotFound();
  if (target.id === adminId) {
    throw createError("Bạn không thể xóa tài khoản của chính mình", 409, "CANNOT_DELETE_SELF");
  }
  if (target.role === Role.ADMIN) {
    throw createError("Phải thu hồi quyền admin trước khi xóa tài khoản này", 409, "CANNOT_DELETE_ADMIN");
  }
  if (target.email === anonymizedUserEmail(target.id)) {
    throw createError("Tài khoản đã được ẩn danh", 409, "USER_ALREADY_ANONYMIZED");
  }
  return target;
}

export async function deleteUser(adminId: number, id: number): Promise<DeleteResult> {
  await requireActiveAdmin(prisma, adminId);
  if (!Number.isInteger(id) || id < -2_147_483_648 || id > 2_147_483_647) throw userNotFound();

  // Kiểm tra trước khi chạy bcrypt. Kết quả đọc dưới khóa mới quyết định nhánh xóa.
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true },
  });
  requireDeletableTarget(target, adminId);
  const passwordHash = await createAnonymizedPasswordHash();

  try {
    return await prisma.$transaction(
      async (tx) => {
        // FOR UPDATE buộc các thao tác thêm dòng có FK tới user này phải chờ.
        const [lockedUser] = await tx.$queryRaw<DeleteTarget[]>`
          SELECT id, role::text AS role, email FROM users WHERE id = ${id} FOR UPDATE
        `;
        await requireActiveAdmin(tx, adminId);
        const user = requireDeletableTarget(lockedUser, adminId);

        if (await hasUserRelatedData(tx, user.id)) {
          return anonymizeUserWithAudit(tx, adminId, user, passwordHash);
        }

        await tx.user.delete({ where: { id: user.id }, select: { id: true } });
        await tx.auditLog.create({
          data: {
            userId: adminId,
            action: "user.delete",
            detail: { target_user_id: user.id, role: user.role },
          },
          select: { id: true },
        });
        return { id: user.id, mode: "deleted" };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        throw createError("Không thể xóa tài khoản do dữ liệu liên quan đã thay đổi", 409, "USER_FOREIGN_KEY_CONFLICT");
      }
      if (error.code === "P2002") {
        throw createError("Email đã được sử dụng", 409, "EMAIL_ALREADY_EXISTS");
      }
    }
    throw error;
  }
}