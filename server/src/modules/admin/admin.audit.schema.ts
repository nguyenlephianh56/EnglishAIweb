import { z } from "zod";

const DEFAULT_AUDIT_LIMIT = 20;
const MAX_AUDIT_LIMIT = 100;
const MAX_INT4 = 2_147_483_647;

function positiveIntegerFromUrl(max: number, message: string) {
  return z.string({ invalid_type_error: message })
    .regex(/^\d+$/, message)
    .transform(Number)
    .refine((value) => value >= 1 && value <= max, message);
}

function auditDateTime(field: "from" | "to") {
  const message = `${field} phải là thời điểm ISO 8601 có múi giờ`;
  return z.string({ invalid_type_error: message })
    .datetime({ offset: true, message })
    .transform((value) => new Date(value))
    .refine((date) => Number.isFinite(date.getTime()), message);
}

export const listAuditLogsQuerySchema = z.object({
  action: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, "action phải có dạng nhóm.hành_động").optional(),
  user_id: positiveIntegerFromUrl(MAX_INT4, "user_id phải là mã người dùng hợp lệ").optional(),
  from: auditDateTime("from").optional(),
  to: auditDateTime("to").optional(),
  limit: positiveIntegerFromUrl(MAX_AUDIT_LIMIT, `limit phải là số nguyên từ 1 đến ${MAX_AUDIT_LIMIT}`)
    .default(String(DEFAULT_AUDIT_LIMIT)),
  cursor: positiveIntegerFromUrl(MAX_INT4, "cursor phải là mã audit hợp lệ").optional(),
}).refine(({ from, to }) => from === undefined || to === undefined || from <= to, {
  path: ["from"],
  message: "from phải nhỏ hơn hoặc bằng to",
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;