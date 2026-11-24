import { z } from "zod";

// Ký tự điều khiển (gồm xuống dòng, tab, NUL...) và dấu ngắt dòng Unicode.
// Tên chỉ được là 1 dòng chữ bình thường.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

// Body của PATCH /api/v1/admin/users/:id
// - Cả hai field đều tùy chọn (không gửi = không đổi).
// - .strict(): có field lạ (role, status, password, passwordHash...) -> 400, thông báo cố định.
// - Thứ tự name: trim TRƯỚC rồi mới đếm độ dài, nên "   " (toàn khoảng trắng) bị từ chối.
// - Email: trim -> kiểm định dạng -> chuyển chữ thường (giống đăng ký/đăng nhập).
export const updateUserBodySchema = z
  .object({
    name: z
      .string({ invalid_type_error: "Tên phải là chuỗi" })
      .trim()
      .min(2, "Tên phải có ít nhất 2 ký tự")
      .max(100, "Tên không được vượt quá 100 ký tự")
      .refine((value) => !CONTROL_CHARS.test(value), {
        message: "Tên không được chứa ký tự xuống dòng hoặc ký tự điều khiển",
      })
      .optional(),

    email: z
      .string({ invalid_type_error: "Email phải là chuỗi" })
      .trim()
      .email("Email không hợp lệ")
      .max(255, "Email không được vượt quá 255 ký tự")
      .transform((value) => value.toLowerCase())
      .optional(),
  })
  // Thông báo CỐ ĐỊNH: không lặp lại tên key người dùng gửi lên (vd "passwordHash"),
  // để response không phản chiếu dữ liệu đầu vào và qua được kiểm tra rò rỉ của T22.
  .strict("Chỉ được gửi name và/hoặc email");

// Kiểu dữ liệu SAU khi parse (email đã là chữ thường, name đã trim)
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;