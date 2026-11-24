import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { UpdateUserBody } from "./admin.users-update.schema";

// Các trường được phép trả về. KHÔNG có passwordHash.
// Giữ đúng dạng item của GET /admin/users hiện có (createdAt camelCase).
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

type ChangedField = "name" | "email";

// Lỗi có statusCode + code, controller đọc để trả response { data, error }
const createError = (message: string, statusCode: number, code: string) =>
  Object.assign(new Error(message), { statusCode, code });

// P2002 = Prisma báo vi phạm UNIQUE của DB (ở đây chỉ có thể là email).
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const emailTakenError = () =>
  createError("Email đã được sử dụng", 409, "EMAIL_ALREADY_EXISTS");

// PATCH /admin/users/:id: sửa name và/hoặc email.
// Không đụng role, status, mật khẩu.
export const updateUser = async (
  actor: { id: number; role: Role },
  id: number,
  input: UpdateUserBody
) => {
  // Kiểm lại quyền ở service (route đã có requireRole, đây là lớp thứ hai).
  if (actor.role !== Role.ADMIN) {
    throw createError("Bạn không có quyền truy cập chức năng này", 403, "FORBIDDEN");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Khóa dòng user đích: nếu hai admin sửa cùng một user song song,
        // người sau phải chờ người trước xong, nên "trước/sau" luôn nhất quán.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR NO KEY UPDATE`;

        const user = await tx.user.findUnique({ where: { id }, select: userSelect });
        if (!user) {
          throw createError("Không tìm thấy tài khoản", 404, "USER_NOT_FOUND");
        }

        // So sánh SAU chuẩn hóa, chỉ giữ field thật sự đổi
        const data: { name?: string; email?: string } = {};
        const changed: ChangedField[] = [];

        if (input.name !== undefined && input.name !== user.name) {
          data.name = input.name;
          changed.push("name");
        }
        if (input.email !== undefined && input.email !== user.email) {
          data.email = input.email;
          changed.push("email");
        }

        // Không đổi gì: trả user hiện tại, KHÔNG update, KHÔNG audit
        if (changed.length === 0) {
          return user;
        }

        // Email trùng user khác? DB có CHECK users_email_lowercase_chk (email luôn chữ thường)
        // nên bình thường so bằng là đủ; so không phân biệt hoa/thường chỉ là lớp phòng thủ thêm.
        if (data.email !== undefined) {
          const duplicate = await tx.user.findFirst({
            where: {
              id: { not: id },
              email: { equals: data.email, mode: "insensitive" },
            },
            select: { id: true },
          });
          if (duplicate) {
            throw emailTakenError();
          }
        }

        const updated = await tx.user.update({
          where: { id },
          data,
          select: userSelect,
        });

        // Audit: CHỈ id user đích + TÊN field đã đổi. Không ghi giá trị name/email.
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: "user.update",
            detail: { target_user_id: id, changed_fields: changed },
          },
        });

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  } catch (error) {
    // Race: hai request cùng lúc đổi hai user sang cùng một email.
    // Cả hai qua được kiểm tra ở trên, DB UNIQUE chặn người đến sau.
    // Transaction đã hủy nên không có audit và không đổi dữ liệu.
    if (isUniqueViolation(error)) {
      throw emailTakenError();
    }
    throw error;
  }
};