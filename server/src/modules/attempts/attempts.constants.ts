/**
 * Số lần nộp tối đa của MỘT học sinh cho MỘT bài giao.
 * Chỉ áp dụng khi có assignmentId; tự luyện không giới hạn.
 * Muốn đổi giới hạn thì chỉ sửa số này, không rải số 3 trong code.
 */
export const MAX_ATTEMPTS_PER_ASSIGNMENT = 3;

/** GET /attempts: số dòng mỗi trang (mặc định) và giới hạn tối đa client được xin. */
export const ATTEMPT_LIST_DEFAULT_LIMIT = 20;
export const ATTEMPT_LIST_MAX_LIMIT = 50;
/**
 * Bài viết (writing).
 * WRITING_TEXT_MAX là trần CỨNG của Zod (sau khi trim): chỉ để chặn payload quá lớn trước khi
 * tới service. Giới hạn nghiệp vụ thật (minWords, WRITING_MAX_WORDS, WRITING_MAX_CHARS) kiểm ở
 * grading/writingLength.ts và trả 400 WRITING_TOO_SHORT / WRITING_TOO_LONG.
 * Đủ cho trường hợp lớn nhất: minWords 1000 -> tối đa 3000 từ ≈ 21000 ký tự. Cũng là trần của
 * WRITING_MAX_CHARS trong config/env.ts.
 */
export const WRITING_TEXT_MAX = 30000;
export const WRITING_MAX_SCORE = 10;