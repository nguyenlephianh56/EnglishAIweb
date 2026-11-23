import axios from "axios";
import { api, unwrap } from "./client";
import type { AiLimits, AiLimitsBody, AuditLogItem, ListAuditLogsParams, ListAuditLogsResult, PromptDetail, PromptSummary } from "../types/adminAi";

/** GET /admin/prompts */
export const listPrompts = () => unwrap<PromptSummary[]>(api.get("/admin/prompts"));

/** GET /admin/prompts/:key (có thêm `template`). 404 PROMPT_NOT_FOUND. */
export const getPrompt = (key: string) => unwrap<PromptDetail>(api.get(`/admin/prompts/${encodeURIComponent(key)}`));

/** PUT /admin/prompts/:key, body {template} (1..20000 ký tự, không có ký tự NUL). 400 nếu thiếu biến bắt buộc hoặc dùng biến lạ. */
export const updatePrompt = (key: string, template: string) => unwrap<PromptDetail>(api.put(`/admin/prompts/${encodeURIComponent(key)}`, { template }));

/** POST /admin/prompts/:key/reset, body {}: khôi phục mẫu mặc định. */
export const resetPrompt = (key: string) => unwrap<PromptDetail>(api.post(`/admin/prompts/${encodeURIComponent(key)}/reset`, {}));

/** GET /admin/ai-limits */
export const getAiLimits = () => unwrap<AiLimits>(api.get("/admin/ai-limits"));

/** PUT /admin/ai-limits, mỗi giá trị là số nguyên 1..1000, không gửi khóa nào khác. Có hiệu lực trong khoảng 30 giây. */
export const updateAiLimits = (body: AiLimitsBody) => unwrap<AiLimits>(api.put("/admin/ai-limits", { student: body.student, teacher: body.teacher }));

/** GET /admin/audit-logs, phân trang theo con trỏ. from/to là ISO 8601 có múi giờ, from <= to. */
export const listAuditLogs = (params: ListAuditLogsParams = {}) => unwrap<ListAuditLogsResult>(api.get("/admin/audit-logs", { params }));

export type { AuditLogItem };

/** Tên các biến báo lỗi trong response 400 của PUT /admin/prompts/:key (error.details.variables); rỗng nếu không có. */
export function getPromptErrorVariables(error: unknown): string[] {
  if (!axios.isAxiosError(error)) return [];
  const details = (error.response?.data as { error?: { details?: { variables?: unknown } } } | undefined)?.error?.details;
  const vars = details?.variables;
  return Array.isArray(vars) ? vars.filter((v): v is string => typeof v === "string") : [];
}
