import { z } from "zod";
import { normalizeReportReason, REPORT_UPDATE_STATUSES } from "./reports.rules";

const MAX_INT4 = 2_147_483_647;
const MAX_REASON_LENGTH = 1000;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;
const REPORT_STATUSES = ["OPEN", ...REPORT_UPDATE_STATUSES] as const;

function positiveInteger(max: number, message: string) {
  return z.number({ required_error: message, invalid_type_error: message })
    .int(message)
    .min(1, message)
    .max(max, message);
}

function integerFromUrl(max: number, message: string) {
  return z.string({ required_error: message, invalid_type_error: message })
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(positiveInteger(max, message));
}

export const createReportBodySchema = z.object({
  exercise_id: positiveInteger(MAX_INT4, "exercise_id phải là mã bài tập hợp lệ"),
  reason: z.string().transform(normalizeReportReason).refine((reason) => {
    const length = Array.from(reason).length;
    return length >= 1 && length <= MAX_REASON_LENGTH;
  }, `reason phải có từ 1 đến ${MAX_REASON_LENGTH} ký tự`),
}).strict();

export const listReportsQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  exercise_id: integerFromUrl(MAX_INT4, "exercise_id phải là mã bài tập hợp lệ").optional(),
  limit: integerFromUrl(MAX_LIST_LIMIT, `limit phải là số nguyên từ 1 đến ${MAX_LIST_LIMIT}`)
    .default(String(DEFAULT_LIST_LIMIT)),
  cursor: integerFromUrl(MAX_INT4, "cursor phải là mã báo lỗi hợp lệ").optional(),
});

export const reportIdParamSchema = z.object({
  id: integerFromUrl(MAX_INT4, "id phải là mã báo lỗi hợp lệ"),
});

export const updateReportBodySchema = z.object({
  status: z.enum(REPORT_UPDATE_STATUSES),
}).strict();

export type CreateReportBody = z.infer<typeof createReportBodySchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
export type ReportIdParam = z.infer<typeof reportIdParamSchema>;
export type UpdateReportBody = z.infer<typeof updateReportBodySchema>;