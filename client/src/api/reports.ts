import { api, unwrap } from "./client";
import type { CreateReportPayload, ListReportsParams, ListReportsResult, ReportItem, ReportUpdateStatus } from "../types/report";

/** POST /reports (chỉ học sinh). 409 REPORT_ALREADY_OPEN nếu đã báo bài này và đang chờ xử lý; 404 nếu bài không tồn tại. */
export const createReport = (body: CreateReportPayload) => unwrap<ReportItem>(api.post("/reports", body));

/** GET /reports (quản trị viên), phân trang theo con trỏ. Tham số undefined không được gửi đi. */
export const listReports = (params: ListReportsParams = {}) => unwrap<ListReportsResult>(api.get("/reports", { params }));

/** PATCH /reports/:id, body chỉ có {status}. OPEN→IN_PROGRESS, OPEN|IN_PROGRESS→RESOLVED; còn lại 409 INVALID_STATUS_TRANSITION. */
export const updateReport = (id: number, status: ReportUpdateStatus) => unwrap<ReportItem>(api.patch(`/reports/${id}`, { status }));
