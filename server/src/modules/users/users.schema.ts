import { z } from "zod";

const BCRYPT_MAX_PASSWORD_BYTES = 72;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
  newPassword: z.string()
    .min(8, "Mật khẩu mới phải có ít nhất 8 ký tự")
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= BCRYPT_MAX_PASSWORD_BYTES,
      "Mật khẩu mới không được vượt quá 72 byte UTF-8"
    ),
}).strict("Chỉ gửi mật khẩu hiện tại và mật khẩu mới");

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;