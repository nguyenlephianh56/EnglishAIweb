// Khung mau cua lop hoc
import { z } from "zod";

// Tạo lớp: chỉ cần tên. Mã lớp do server tự sinh, client không được gửi lên
export const createClassSchema = z.object({
  name: z
    .string({ required_error: "Vui lòng nhập tên lớp" })
    .trim()
    .min(1, "Tên lớp không được để trống")
    .max(100, "Tên lớp không được vượt quá 100 ký tự"),
});

// HS tham gia lớp: chuẩn hóa mã (bỏ khoảng trắng, viết HOA) TRƯỚC khi kiểm định dạng
// Vì vậy "  ab12cd " vẫn hợp lệ và trở thành "AB12CD"
export const joinClassSchema = z.object({
  code: z
    .string({ required_error: "Vui lòng nhập mã lớp" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "Mã lớp phải gồm đúng 6 ký tự chữ hoặc số"),
});

// GV thêm HS bằng email: chuẩn hóa chữ thường (giống auth.schema)
export const addStudentSchema = z.object({
  email: z
    .string({ required_error: "Vui lòng nhập email" })
    .trim()
    .email("Email không hợp lệ")
    .max(255, "Email không được vượt quá 255 ký tự")
    .transform((value) => value.toLowerCase()),
});

// Kiểm tra :id của lớp trên URL (vd /classes/5)
export const classIdParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: "ID lớp không hợp lệ" })
    .int("ID lớp không hợp lệ")
    .positive("ID lớp không hợp lệ"),
});

// Kiểm tra cả :id và :studentId (vd /classes/5/students/12)
export const classStudentParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: "ID lớp không hợp lệ" })
    .int("ID lớp không hợp lệ")
    .positive("ID lớp không hợp lệ"),
  studentId: z.coerce
    .number({ invalid_type_error: "ID học sinh không hợp lệ" })
    .int("ID học sinh không hợp lệ")
    .positive("ID học sinh không hợp lệ"),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type JoinClassInput = z.infer<typeof joinClassSchema>;
export type AddStudentInput = z.infer<typeof addStudentSchema>;
export type ClassIdParam = z.infer<typeof classIdParamSchema>;
export type ClassStudentParam = z.infer<typeof classStudentParamSchema>;