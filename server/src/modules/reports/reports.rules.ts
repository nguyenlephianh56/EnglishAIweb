export const REPORT_UPDATE_STATUSES = ["IN_PROGRESS", "RESOLVED"] as const;
export type ReportUpdateStatus = (typeof REPORT_UPDATE_STATUSES)[number];

export function normalizeReportReason(reason: string): string {
  return reason.replace(/\p{Cc}/gu, "").trim();
}

export function canTransitionReportStatus(from: string, to: ReportUpdateStatus): boolean {
  return (from === "OPEN" && to === "IN_PROGRESS")
    || ((from === "OPEN" || from === "IN_PROGRESS") && to === "RESOLVED");
}