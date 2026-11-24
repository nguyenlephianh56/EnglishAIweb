import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";

type MakeUserOptions = { name?: string; email?: string; role?: Role; status?: UserStatus };

// Bộ dụng cụ cho test T29 (Sửa): tạo user thử, đọc audit, dọn dẹp.
// Chỉ dùng trong test. Mỗi file test gọi createUpdateKit() một lần.
export function createUpdateKit() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const password = `t29-password-${randomUUID()}`;
  const userIds: number[] = [];
  let hash: Promise<string> | undefined;
  let counter = 0; // mỗi lần makeUser có email riêng, kể cả khi trùng label (it.each)

  const emailFor = (label: string) => `t29-${label.toLowerCase()}-${suffix}@example.test`;

  return {
    suffix,
    password,
    emailFor,

    async makeUser(label: string, options: MakeUserOptions = {}) {
      hash ??= bcrypt.hash(password, 4);
      const user = await prisma.user.create({
        data: {
          name: options.name ?? `T29 ${label}`,
          email: options.email ?? `t29-${label.toLowerCase()}-${suffix}-${++counter}@example.test`,
          passwordHash: await hash,
          role: options.role ?? Role.STUDENT,
          status: options.status ?? UserStatus.ACTIVE,
        },
        select: { id: true, name: true, email: true, role: true, status: true },
      });
      userIds.push(user.id);
      return user;
    },

    // Đọc nguyên dòng user (kể cả passwordHash) để so "không đổi" - chỉ dùng trong test
    snapshot: (id: number) => prisma.user.findUniqueOrThrow({ where: { id } }),

    // Các dòng audit user.update nhắm vào user này
    updateAudits: (targetId: number) =>
      prisma.auditLog.findMany({
        where: { action: "user.update", detail: { path: ["target_user_id"], equals: targetId } },
        orderBy: { id: "asc" },
      }),

    async cleanup(adminIds: number[] = []) {
      const or: Prisma.AuditLogWhereInput[] = [
        { userId: { in: adminIds } },
        ...userIds.map((id) => ({
          action: "user.update",
          detail: { path: ["target_user_id"], equals: id },
        })),
      ];
      await prisma.auditLog.deleteMany({ where: { OR: or } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    },
  };
}