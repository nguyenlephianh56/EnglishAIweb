import type { Request, RequestHandler } from "express";
import { failure } from "../../utils/response";
import { userIdParamSchema } from "./admin.schema";
import { promoteAdminBodySchema, type RevokeAdminBody } from "./admin.users-role.schema";
import { promoteAdmin, revokeAdmin } from "./admin.users-role.service";

// ID của users là Int 32 bit trong PostgreSQL.
const roleUserIdParamSchema = userIdParamSchema.extend({
  id: userIdParamSchema.shape.id.max(2_147_483_647, "ID không hợp lệ"),
});

export const validatePromoteAdminBody: RequestHandler = (req, res, next) => {
  // Express 4 có thể gán {} cả khi request thực sự không có body.
  const hasBody = req.get("transfer-encoding") !== undefined || Number(req.get("content-length")) > 0;
  const body = hasBody ? req.body ?? {} : undefined;
  if (!promoteAdminBodySchema.safeParse(body).success) {
    return failure(res, "VALIDATION_ERROR", "API bổ nhiệm quản trị viên không nhận body", 400);
  }
  next();
};

type ChangeRole = (adminId: number, id: number, req: Request) => ReturnType<typeof promoteAdmin>;

const handleRoleChange = (changeRole: ChangeRole): RequestHandler => async (req, res, next) => {
  if (!req.user) {
    return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
  }

  const params = roleUserIdParamSchema.safeParse(req.params);
  if (!params.success) {
    return failure(res, "VALIDATION_ERROR", "ID không hợp lệ", 400);
  }
  if (Object.keys(req.query).length > 0) {
    return failure(res, "VALIDATION_ERROR", "API đổi vai trò không nhận tham số truy vấn", 400);
  }

  try {
    const user = await changeRole(req.user.id, params.data.id, req);
    return res.status(200).json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const err = error as (Error & { statusCode?: number; code?: string }) | null;
    if (err?.statusCode && err.code) {
      return failure(res, err.code, err.message, err.statusCode);
    }
    next(error);
  }
};

export const promoteAdminHandler = handleRoleChange(promoteAdmin);

export const revokeAdminHandler = handleRoleChange((adminId, id, req) => {
  const { role } = req.body as RevokeAdminBody;
  return revokeAdmin(adminId, id, role);
});