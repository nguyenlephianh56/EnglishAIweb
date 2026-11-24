import { randomBytes } from "node:crypto";
import { UserStatus, type Prisma, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const ANONYMIZED_USER_NAME = "Người dùng đã xóa";
const BCRYPT_COST = 10; // Cùng cost với auth.service.ts.

export function anonymizedUserEmail(id: number): string {
  return `deleted-${id}@deleted.invalid`;
}

// Tính hash trước khi mở transaction để giảm thời gian giữ khóa dòng user.
export function createAnonymizedPasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_COST);
}

// Service gọi hàm này sau khi khóa dòng, kiểm quyền và xác định user có lịch sử.
export async function anonymizeUserWithAudit(
  tx: Prisma.TransactionClient,
  adminId: number,
  target: { id: number; role: Role },
  passwordHash: string
): Promise<{ id: number; mode: "anonymized" }> {
  await tx.user.update({
    where: { id: target.id },
    data: {
      name: ANONYMIZED_USER_NAME,
      email: anonymizedUserEmail(target.id),
      passwordHash,
      status: UserStatus.LOCKED,
    },
    select: { id: true },
  });

  await tx.auditLog.create({
    data: {
      userId: adminId,
      action: "user.anonymize",
      detail: { target_user_id: target.id, role: target.role },
    },
    select: { id: true },
  });

  return { id: target.id, mode: "anonymized" };
}