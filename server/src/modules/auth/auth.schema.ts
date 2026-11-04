
import { z } from "zod";

// Schema đăng ký
export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Tên phải có ít nhất 2 ký tự")
    .max(100, "Tên không được vượt quá 100 ký tự"),

  email: z
    .string()
    .trim()
    .email("Email không hợp lệ")
    .max(255, "Email không được vượt quá 255 ký tự")
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự"),

  role: z
    .enum(["STUDENT", "TEACHER"])
    .default("STUDENT"),
});

// Schema đăng nhập
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Email không hợp lệ")
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(1, "Vui lòng nhập mật khẩu"),
});

// Type dữ liệu
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
