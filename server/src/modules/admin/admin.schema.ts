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

// Độ dài tối đa của từ khóa tìm kiếm `q` (một nơi duy nhất, test cũng dùng hằng số này)
export const USER_SEARCH_MAX_LENGTH = 100;

// Kiểm tra query lọc danh sách (vd ?role=TEACHER&status=PENDING&q=an)
// Cả ba đều tùy chọn: không gửi thì không lọc theo mục đó
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

  // Tìm theo tên HOẶC email (không phân biệt hoa/thường, khớp một phần).
  // trim trước rồi mới đếm độ dài; rỗng/toàn khoảng trắng -> undefined = không lọc.
  // Gửi nhiều lần (?q=a&q=b) -> không phải chuỗi -> 400.
  q: z
    .string({ invalid_type_error: "q phải là một chuỗi" })
    .trim()
    .max(USER_SEARCH_MAX_LENGTH, `q tối đa ${USER_SEARCH_MAX_LENGTH} ký tự`)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;