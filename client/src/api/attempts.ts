import { api, unwrap } from "./client";
import type { AttemptReview, TeacherGradeBody, TeacherGradeResult } from "../types/attemptReview";
import type { AttemptDetail, AttemptResult, AssignmentAttemptExtras, AudioUploadResult, GradingError, SubmitAttemptBody, SubmitOutcome } from "../types/attempt";

type ResultWithExtras = AttemptResult & Partial<AssignmentAttemptExtras>;
/** 201/200 = kết quả; 202 = { attemptId, attempt, gradingError } */
type SubmitResponse = ResultWithExtras | { attemptId: number; attempt: ResultWithExtras; gradingError: GradingError };

const normalize = (data: SubmitResponse): SubmitOutcome => ("gradingError" in data ? { result: data.attempt, gradingError: data.gradingError } : { result: data });

/**
 * POST /attempts: nộp bài. Có assignmentId = bài giao (tối đa 3 lần), không có = tự luyện.
 * Bài Viết có thể trả 202 (đã lưu nhưng AI chấm lỗi): gộp thành { result, gradingError }.
 */
export const submitAttempt = async (body: SubmitAttemptBody, options: { timeoutMs?: number } = {}): Promise<SubmitOutcome> =>
  normalize(await unwrap<SubmitResponse>(api.post("/attempts", body, options.timeoutMs ? { timeout: options.timeoutMs } : undefined)));

/** Nộp bài Nói: backend chữ hóa âm thanh rồi chấm nên chờ tới 90 giây */
export const SPEAKING_SUBMIT_TIMEOUT_MS = 90_000;
const AUDIO_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * POST /attempts/audio?exerciseId=..|assignmentId=..: tải bản ghi âm lên (multipart, một field "audio").
 * Tối đa 10 MB, webm/mp3/wav. Trả audio_id dùng được khoảng 60 phút để nộp bài bằng submitAttempt({ answer: { audio_id } }).
 */
export const uploadAttemptAudio = (blob: Blob, target: { exerciseId?: number; assignmentId?: number }) => {
  const form = new FormData();
  form.append("audio", new Blob([blob], { type: "audio/webm" }), "speech.webm");
  return unwrap<AudioUploadResult>(
    api.post("/attempts/audio", form, {
      params: target.assignmentId !== undefined ? { assignmentId: target.assignmentId } : { exerciseId: target.exerciseId },
      headers: { "Content-Type": "multipart/form-data" },
      timeout: AUDIO_UPLOAD_TIMEOUT_MS,
    }),
  );
};

/** GET /attempts/:id: chi tiết một lần nộp của chính học sinh (404 nếu không phải của mình) */
export const getAttempt = (id: number) => unwrap<AttemptDetail>(api.get(`/attempts/${id}`));

/** POST /attempts/:id/regrade: chấm lại bài Viết đang chờ chấm (200 = xong, 202 = AI lại lỗi) */
export const regradeAttempt = async (id: number): Promise<SubmitOutcome> => normalize(await unwrap<SubmitResponse>(api.post(`/attempts/${id}/regrade`)));

/** GET /attempts/:id/review: giáo viên/quản trị xem bài nộp (404 nếu không thuộc lớp của mình hoặc không tồn tại) */
export const getAttemptReview = (id: number) => unwrap<AttemptReview>(api.get(`/attempts/${id}/review`));

/** PATCH /attempts/:id/grade: giáo viên chấm/sửa điểm và nhận xét. Chỉ gửi field thay đổi. */
export const saveTeacherGrade = (id: number, body: TeacherGradeBody) => unwrap<TeacherGradeResult>(api.patch(`/attempts/${id}/grade`, body));
