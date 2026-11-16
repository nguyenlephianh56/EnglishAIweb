// =====================================================================
// skill-profiles/skill-profiles.representative.ts — Điểm đại diện của bài (T14, dòng "chốt nộp nhiều lần").
//
// Hàm THUẦN: không DB, không Prisma, không đọc env. Nhận mảng attempt của MỘT học sinh thuộc MỘT kỹ năng
// (đã lọc sẵn ở bước truy vấn), chọn 1 attempt đại diện cho mỗi bài, trả về để đưa vào calcProfileScore.
//
// QUY TẮC (xem Project.md 4c mục 8):
//  - Điểm của 1 attempt = COALESCE(teacher_score, score); NULL/NaN/ngoài [0, 10] -> attempt bị bỏ qua.
//  - "Một bài" = một lượt giao (assignmentId). Tự luyện (assignmentId NULL) gom theo exerciseId.
//  - Đại diện = attempt điểm cao nhất trong nhóm; hòa điểm lấy lần mới nhất.
// =====================================================================
import { PROFILE_SCORE_MAX, PROFILE_SCORE_MIN } from "./skill-profiles.constants";

/**
 * Phần tối thiểu của một attempt mà hàm cần biết (tên field theo Prisma, camelCase).
 * Hàm là generic `<T extends AttemptLike>`, nên attempt trả ra GIỮ NGUYÊN mọi field khác
 * (vd `errors`, `isLate`) mà không phải khai báo ở đây.
 */
export interface AttemptLike {
  id: number;
  exerciseId: number;
  /** NULL = bài tự luyện. */
  assignmentId: number | null;
  /** Điểm AI/tự động chấm; NULL = chưa chấm. */
  score: number | null;
  /** Điểm GV ghi đè; NULL = GV chưa chấm/sửa. */
  teacherScore: number | null;
  submittedAt: Date;
}

/**
 * Điểm cuối (thang 10) của một attempt = COALESCE(teacherScore, score).
 *  - teacherScore khác null/undefined thì dùng nó, KỂ CẢ khi nó không hợp lệ (đúng nghĩa COALESCE:
 *    điểm GV hỏng không bị che đi bằng điểm AI);
 *  - kết quả null/undefined, NaN, Infinity hoặc ngoài [0, 10] -> trả null (attempt không có điểm hợp lệ).
 * Điểm 0 là điểm thật (không bị nhầm với null).
 */
export const getFinalScore = (
  attempt: Pick<AttemptLike, "score" | "teacherScore">
): number | null => {
  const value = attempt.teacherScore ?? attempt.score;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < PROFILE_SCORE_MIN ||
    value > PROFILE_SCORE_MAX
  ) {
    return null;
  }
  return value;
};

/**
 * Khóa nhóm: các attempt cùng khóa là "cùng một bài".
 *  - Bài giao:  "a:<assignmentId>" (hai lượt giao khác nhau của cùng một bài là hai nhóm khác nhau);
 *  - Tự luyện:  "e:<exerciseId>"   (làm lại cùng một bài tự luyện là cùng một nhóm).
 * Tiền tố a:/e: để bài giao và tự luyện không bao giờ đụng nhau dù trùng số.
 */
export const getAttemptGroupKey = (
  attempt: Pick<AttemptLike, "assignmentId" | "exerciseId">
): string =>
  attempt.assignmentId === null || attempt.assignmentId === undefined
    ? `e:${attempt.exerciseId}`
    : `a:${attempt.assignmentId}`;

/**
 * Gom attempt theo khóa nhóm. Không sửa mảng đầu vào; thứ tự attempt trong mỗi nhóm giữ nguyên
 * như đầu vào. Chỉ gom, CHƯA lọc điểm (lọc ở bước chọn đại diện).
 */
export const groupAttemptsByKey = <T extends AttemptLike>(
  attempts: readonly T[]
): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const attempt of attempts) {
    const key = getAttemptGroupKey(attempt);
    const group = groups.get(key);
    if (group) {
      group.push(attempt);
    } else {
      groups.set(key, [attempt]);
    }
  }
  return groups;
};

/**
 * Attempt `candidate` có "tốt hơn" `current` không? Thứ tự ưu tiên:
 *  1) điểm cuối CAO hơn;
 *  2) hòa điểm: nộp MUỘN hơn (submittedAt lớn hơn);
 *  3) vẫn hòa: `id` LỚN hơn (id tăng dần theo thời gian tạo, giúp kết quả luôn xác định).
 */
const isBetterAttempt = (
  candidate: { score: number; attempt: AttemptLike },
  current: { score: number; attempt: AttemptLike }
): boolean => {
  if (candidate.score !== current.score) return candidate.score > current.score;
  const candidateTime = candidate.attempt.submittedAt.getTime();
  const currentTime = current.attempt.submittedAt.getTime();
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.attempt.id > current.attempt.id;
};

/**
 * Chọn attempt đại diện trong MỘT nhóm (cùng một bài): attempt có điểm cuối cao nhất.
 * Attempt không có điểm hợp lệ (xem getFinalScore) bị bỏ qua; nhóm không còn attempt nào -> null.
 * Điểm cuối được tính theo TỪNG attempt rồi mới so sánh, nên điểm GV ghi đè thấp hơn điểm AI
 * của lần khác vẫn được tôn trọng nếu đó là điểm cao nhất.
 */
export const pickRepresentative = <T extends AttemptLike>(group: readonly T[]): T | null => {
  let best: { score: number; attempt: T } | null = null;
  for (const attempt of group) {
    const score = getFinalScore(attempt);
    if (score === null) continue;
    const candidate = { score, attempt };
    if (best === null || isBetterAttempt(candidate, best)) {
      best = candidate;
    }
  }
  return best === null ? null : best.attempt;
};

/**
 * So sánh để sắp xếp GẦN NHẤT TRƯỚC: submittedAt lớn hơn đứng trước; bằng nhau thì `id` lớn hơn đứng trước.
 * Dùng với Array.sort: trả số âm nghĩa là `a` đứng trước `b`.
 */
const compareNewestFirst = (a: AttemptLike, b: AttemptLike): number => {
  const timeDiff = b.submittedAt.getTime() - a.submittedAt.getTime();
  return timeDiff !== 0 ? timeDiff : b.id - a.id;
};

/**
 * Mỗi bài một attempt đại diện (xem quy tắc ở đầu file). Nhóm không có attempt nào có điểm hợp lệ
 * thì không xuất hiện trong kết quả. Trả về chính các object attempt đầu vào (không sao chép, không sửa
 * mảng đầu vào), nên còn nguyên `errors`, `isLate`...
 *
 * THỨ TỰ KẾT QUẢ: gần nhất trước, theo `submittedAt` của chính attempt đại diện (hòa thì `id` lớn trước),
 * khớp quy ước "phần tử đầu = gần nhất" của calcProfileScore. Mảng trả về là mảng MỚI, mảng đầu vào
 * không bị đổi thứ tự.
 * Hạn chế đã biết: mốc thời gian là của lần điểm CAO NHẤT, không phải lần làm gần nhất. HS luyện lại một
 * bài cũ với điểm thấp hơn thì bài đó không được đẩy lên đầu cửa sổ.
 */
export const selectRepresentativeAttempts = <T extends AttemptLike>(
  attempts: readonly T[]
): T[] => {
  const representatives: T[] = [];
  for (const group of groupAttemptsByKey(attempts).values()) {
    const representative = pickRepresentative(group);
    if (representative !== null) representatives.push(representative);
  }
  // Sort trên mảng `representatives` do hàm tự tạo, nên không đụng tới mảng đầu vào.
  return representatives.sort(compareNewestFirst);
};