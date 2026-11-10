/**
 * Hàm dùng chung để che đáp án khi trả bài tập cho HỌC SINH (quy tắc 4c.5).
 *
 * Mọi API trả bài cho HS (chi tiết, danh sách, làm bài, bài giao...) PHẢI đi qua hàm này,
 * để không bao giờ sót field `answer`.
 *
 * Cách làm an toàn: DANH SÁCH TRẮNG. Hàm tự tay chọn từng field được phép trả ra,
 * thay vì "xóa answer khỏi object". Nhờ vậy, sau này bảng exercises có thêm cột mới
 * (hoặc ai đó select thêm field) thì cột đó cũng KHÔNG tự lọt ra cho HS.
 *
 * Field HS được nhận: id, type, skill, level, topic, content.
 * Field HS KHÔNG bao giờ nhận: answer, status, source, inLibrary, createdById, createdAt, updatedAt.
 * `explanation` chỉ có khi nơi gọi cho phép (revealExplanation = true), ví dụ:
 *   - T4: bài tự luyện sau khi nộp; bài giao sau due_at.
 *   - T5: bài giao sau due_at.
 */

// Chỉ cần các field này; object đầy đủ từ Prisma (có thêm field khác) vẫn truyền vào được.
export interface ExerciseForView {
  id: number;
  type: string;
  skill: string;
  level: string;
  topic: string;
  content: unknown;
  explanation?: string | null;
}

export interface StudentViewOptions {
  /** true khi đã được lộ giải thích (4c.4). Mặc định false = không trả explanation. */
  revealExplanation?: boolean;
}

export interface StudentExerciseView {
  id: number;
  type: string;
  skill: string;
  level: string;
  topic: string;
  content: unknown;
  /** Chỉ xuất hiện khi revealExplanation = true (có thể là null nếu bài không có giải thích). */
  explanation?: string | null;
}

export function toStudentView(
  exercise: ExerciseForView,
  options: StudentViewOptions = {}
): StudentExerciseView {
  const view: StudentExerciseView = {
    id: exercise.id,
    type: exercise.type,
    skill: exercise.skill,
    level: exercise.level,
    topic: exercise.topic,
    content: exercise.content,
  };

  // Chưa được lộ -> KHÔNG có key explanation (không trả cả null để khỏi gợi ý là có giải thích)
  if (options.revealExplanation === true) {
    view.explanation = exercise.explanation ?? null;
  }

  return view;
}