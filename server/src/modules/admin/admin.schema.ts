import { z } from "zod";
import { Role, UserStatus } from "@prisma/client";

// Kiểm tra :id trên URL (vd /admin/users/5/approve)
// z.coerce.number(): URL luôn là chuỗi "5" nên phải ép sang số trước khi kiểm
export const userIdParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: "ID không hợp lệ" })
    .int("ID không hợp lệ")
    .positive("ID không hợp lệ"),
});

// Kiểm tra query lọc danh sách (vd ?role=TEACHER&status=PENDING)
// Cả hai đều tùy chọn: không gửi thì không lọc theo mục đó
export const listUsersQuerySchema = z.object({
  role: z
    .nativeEnum(Role, {
      errorMap: () => ({ message: "role phải là STUDENT, TEACHER hoặc ADMIN" }),
    })
    .optional(),

  status: z
    .nativeEnum(UserStatus, {
      errorMap: () => ({
        message: "status phải là PENDING, ACTIVE hoặc LOCKED",
      }),
    })
    .optional(),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;