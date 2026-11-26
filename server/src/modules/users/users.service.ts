import bcrypt from "bcryptjs";
import { UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { ChangePasswordInput } from "./users.schema";

export async function changePassword(userId: number, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, status: true },
  });

  if (!user || user.status !== UserStatus.ACTIVE) return "unavailable";

  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    return "invalidCurrent";
  }

  if (await bcrypt.compare(input.newPassword, user.passwordHash)) {
    return "unchanged";
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  // Chỉ ghi khi mật khẩu và trạng thái vẫn khớp với lúc kiểm tra.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, passwordHash: user.passwordHash, status: UserStatus.ACTIVE },
    data: { passwordHash },
  });

  return count === 1 ? "changed" : "conflict";
}