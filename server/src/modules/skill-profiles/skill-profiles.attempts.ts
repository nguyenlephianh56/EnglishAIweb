// =====================================================================
// skill-profiles/skill-profiles.attempts.ts — Lấy attempt của 1 HS thuộc 1 kỹ năng (T14, dòng upsert).
//
// Đây là bước (1) của recomputeSkillProfile: chỉ ĐỌC, không ghi gì. Kết quả đưa thẳng vào
// selectRepresentativeAttempts (phần chọn đại diện làm ở file riêng, không viết lại ở đây).
//
// `db` là Prisma client HOẶC transaction client (Prisma.TransactionClient), để dòng sau chạy chung
// transaction với attempt. File này không tự tạo kết nối.
//
// GIỚI HẠN ĐỌC (Project.md 4c mục 9): tối đa MAX_ATTEMPTS_READ = 300 attempt GẦN NHẤT của kỹ năng
// (theo submittedAt giảm dần, hòa thì id giảm dần). Cảnh báo / hạn chế đã biết:
//  - Bài rất cũ có thể không còn nằm trong 300 attempt này. Nếu một bài giao có lần điểm cao nhất
//    nằm ngoài 300, đại diện của bài đó có thể lệch (chỉ thấy các lần nộp gần hơn).
//  - Attempt chưa chấm (score và teacherScore đều NULL) vẫn chiếm chỗ trong 300; chúng chỉ bị loại
//    ở bước chọn đại diện, không loại ở truy vấn.
//  Cửa sổ tính điểm chỉ N = 10 bài nên 300 là dư rộng cho HS bình thường.
//
// Chỉ SELECT các trường cần dùng: không đọc `answer` (bài làm của HS) hay `aiFeedback`, để nhẹ và
// để không có chỗ nào vô tình log nội dung bài.
// =====================================================================
import type { Prisma, Skill } from "@prisma/client";
import type { AttemptLike } from "./skill-profiles.representative";

/** Số attempt tối đa đọc từ DB cho một (HS, kỹ năng). */
export const MAX_ATTEMPTS_READ = 300;

/**
 * Một dòng attempt dùng cho hồ sơ kỹ năng: phần AttemptLike (id, exerciseId, assignmentId, score,
 * teacherScore, submittedAt) cộng `errors` (JSON tự do, sẽ được mergeErrorStats đọc an toàn).
 */
export type SkillAttemptRow = AttemptLike & { errors: Prisma.JsonValue | null };

/**
 * Lấy tối đa `limit` attempt gần nhất của học sinh `studentId` thuộc kỹ năng `skill`
 * (kỹ năng lấy qua `exercises.skill`). Thứ tự: gần nhất trước.
 *
 * `limit` phải là số nguyên >= 1, sai thì ném RangeError (lỗi lập trình, không phải dữ liệu).
 */
export const fetchSkillAttempts = async (
  db: Prisma.TransactionClient,
  studentId: number,
  skill: Skill,
  limit: number = MAX_ATTEMPTS_READ
): Promise<SkillAttemptRow[]> => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Giới hạn số attempt đọc phải là số nguyên >= 1.");
  }

  return db.attempt.findMany({
    where: { studentId, exercise: { skill } },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      exerciseId: true,
      assignmentId: true,
      score: true,
      teacherScore: true,
      errors: true,
      submittedAt: true,
    },
  });
};