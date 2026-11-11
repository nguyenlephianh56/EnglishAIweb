/**
 * Số lần nộp tối đa của MỘT học sinh cho MỘT bài giao.
 * Chỉ áp dụng khi có assignmentId; tự luyện không giới hạn.
 * Muốn đổi giới hạn thì chỉ sửa số này, không rải số 3 trong code.
 */
export const MAX_ATTEMPTS_PER_ASSIGNMENT = 3;

/** GET /attempts: số dòng mỗi trang (mặc định) và giới hạn tối đa client được xin. */
export const ATTEMPT_LIST_DEFAULT_LIMIT = 20;
export const ATTEMPT_LIST_MAX_LIMIT = 50;