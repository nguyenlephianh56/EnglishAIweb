import type { Role, UserStatus } from "./auth";

/** Một dòng của GET /admin/users (không có passwordHash) */
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export type OverviewRange = "7d" | "30d";

export interface ActivityPoint {
  label: string;
  /** Người dùng hoạt động trong ngày */
  users: number;
  /** Lượt gọi AI trong ngày */
  aiCalls: number;
}

export interface AiUsage {
  used: number;
  limit: number;
  breakdown: { grading: number; generation: number; analysis: number };
}

/** Phần dữ liệu của trang Tổng quan mà backend CHƯA có API (đang là dữ liệu giả) */
export interface OverviewMock {
  aiCallsToday: number;
  openReports: number;
  highPriorityReports: number;
  activity: ActivityPoint[];
  aiUsage: AiUsage;
}
