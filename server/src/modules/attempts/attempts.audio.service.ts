import { AudioUploadError } from "./attempts.audio.errors";
import type { AudioUploadQuery } from "./attempts.audio.schema";
import { resolveSubmitTarget } from "./attempts.service";

/**
 * Kiểm quyền upload âm thanh. Chạy TRƯỚC multer, nên mọi ca bị từ chối đều chưa có file nào
 * được ghi. Dùng CHUNG hàm kiểm của POST /attempts (resolveSubmitTarget), không có bản thứ hai:
 *  - tự luyện: bài PUBLISHED + in_library, nếu không -> 404
 *  - bài giao: assignment tồn tại + HS thuộc lớp (404), exerciseId khớp (400), bài không HIDDEN (404),
 *    còn lượt nộp (409 ATTEMPT_LIMIT_REACHED); nộp trễ vẫn nhận
 * Thêm một điều kiện riêng của upload: bài phải là dạng speaking (400).
 * studentId lấy từ JWT (user.id), không nhận từ client.
 */
export const assertCanUploadAudio = async (
  user: { id: number },
  query: AudioUploadQuery
): Promise<void> => {
  const { exercise } = await resolveSubmitTarget(user, query);

  if (exercise.type !== "speaking") {
    throw new AudioUploadError(
      400,
      "AUDIO_WRONG_EXERCISE_TYPE",
      "Chỉ nhận tệp âm thanh cho bài dạng Nói (speaking)"
    );
  }
};