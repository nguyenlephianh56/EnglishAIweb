import { api, unwrap } from "./client";
import type { AttemptDetail, AttemptResult, AssignmentAttemptExtras, GradingError, SubmitAttemptBody, SubmitOutcome } from "../types/attempt";

type ResultWithExtras = AttemptResult & Partial<AssignmentAttemptExtras>;
/** 201/200 = kết quả; 202 = { attemptId, attempt, gradingError } */
type SubmitResponse = ResultWithExtras | { attemptId: number; attempt: ResultWithExtras; gradingError: GradingError };

const normalize = (data: SubmitResponse): SubmitOutcome => ("gradingError" in data ? { result: data.attempt, gradingError: data.gradingError } : { result: data });

/**
 * POST /attempts: nộp bài. Có assignmentId = bài giao (tối đa 3 lần), không có = tự luyện.
 * Bài Viết có thể trả 202 (đã lưu nhưng AI chấm lỗi): gộp thành { result, gradingError }.
 */
export const submitAttempt = async (body: SubmitAttemptBody): Promise<SubmitOutcome> => normalize(await unwrap<SubmitResponse>(api.post("/attempts", body)));

/** GET /attempts/:id: chi tiết một lần nộp của chính học sinh (404 nếu không phải của mình) */
export const getAttempt = (id: number) => unwrap<AttemptDetail>(api.get(`/attempts/${id}`));

/** POST /attempts/:id/regrade: chấm lại bài Viết đang chờ chấm (200 = xong, 202 = AI lại lỗi) */
export const regradeAttempt = async (id: number): Promise<SubmitOutcome> => normalize(await unwrap<SubmitResponse>(api.post(`/attempts/${id}/regrade`)));
