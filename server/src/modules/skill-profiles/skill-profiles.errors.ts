// =====================================================================
// skill-profiles/skill-profiles.errors.ts — Gộp thống kê lỗi cho hồ sơ kỹ năng (T14, dòng upsert).
//
// Hàm THUẦN: không DB, không Prisma, không đọc env. Nhận các attempt ĐẠI DIỆN nằm trong cửa sổ N
// (cùng tập với `score`, xem Project.md 4c mục 9) và cộng số lần xuất hiện của từng `errors[].type`.
//
// QUY TẮC:
//  - Mỗi phần tử `errors[]` hợp lệ được tính ĐÚNG 1 lần (không khử trùng lặp trong cùng attempt).
//  - Key = nguyên chuỗi `type` (không đổi hoa/thường, không sửa khoảng trắng), vd "grammar:tense".
//  - Phần tử hỏng (không phải object, thiếu `type`, `type` không phải chuỗi, chuỗi rỗng/chỉ toàn
//    khoảng trắng) bị BỎ QUA, không ném lỗi. `errors` là null/không phải mảng thì attempt đóng góp 0.
//  - Không ghi log nội dung `errors` (có thể chứa câu của học sinh).
// =====================================================================

/** JSON lưu ở cột `error_stats`: { "<type>": <số lần> }. */
export type ErrorStats = Record<string, number>;

/** Phần tối thiểu của attempt mà hàm cần biết. `errors` là JSON tự do nên để `unknown`. */
export interface AttemptWithErrors {
  errors?: unknown;
}

/** Trả `type` hợp lệ của một phần tử `errors[]`, hoặc null nếu phần tử hỏng. */
const readErrorType = (item: unknown): string | null => {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
  const type = (item as { type?: unknown }).type;
  if (typeof type !== "string" || type.trim() === "") return null;
  return type;
};

/**
 * Cộng dồn số lần xuất hiện của từng `type` qua các attempt đã cho.
 * Không sửa đầu vào. Không có lỗi hợp lệ nào thì trả `{}`.
 *
 * Dùng Map rồi Object.fromEntries để key như "__proto__" hay "constructor" chỉ là key bình thường,
 * không đụng prototype của object kết quả.
 */
export const mergeErrorStats = (attempts: readonly AttemptWithErrors[]): ErrorStats => {
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    const errors = attempt?.errors;
    if (!Array.isArray(errors)) continue;
    for (const item of errors) {
      const type = readErrorType(item);
      if (type === null) continue;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  return Object.fromEntries(counts);
};