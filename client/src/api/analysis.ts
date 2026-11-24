import { api, unwrap } from "./client";
import type { ClassAnalysis, StudentAnalysis } from "../types/analysis";

/** Mỗi lần gọi chạy AI (10–30 giây) và trừ vào lượt AI trong ngày của giáo viên */
const ANALYSIS_TIMEOUT_MS = 60_000;

/** POST /analysis/classes/:classId, body {} (giáo viên/quản trị viên). 422 NOT_ENOUGH_DATA, 404, 429, 502/503/504. */
export const analyzeClass = (classId: number) => unwrap<ClassAnalysis>(api.post(`/analysis/classes/${classId}`, {}, { timeout: ANALYSIS_TIMEOUT_MS }));

/** POST /analysis/students/:studentId, body {}. Cùng các lỗi như analyzeClass. */
export const analyzeStudent = (studentId: number) => unwrap<StudentAnalysis>(api.post(`/analysis/students/${studentId}`, {}, { timeout: ANALYSIS_TIMEOUT_MS }));
