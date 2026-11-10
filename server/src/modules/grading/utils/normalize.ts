/**
 * Hàm so sánh chuỗi dùng chung cho các dạng điền chữ
 * (fill_blank, listening_fill, error_correction). Project.md 4c.1.
 *
 * Quy tắc (đã chốt):
 *  - trim khoảng trắng đầu/cuối;
 *  - gộp nhiều khoảng trắng liên tiếp ở giữa (cả tab, xuống dòng) thành 1 dấu cách;
 *  - KHÔNG phân biệt hoa/thường;
 *  - chuẩn hóa Unicode NFC (chữ có dấu gõ kiểu khác nhau vẫn khớp);
 *  - KHÔNG bỏ dấu câu ("goes." khác "goes");
 *  - KHÔNG hỗ trợ nhiều đáp án bằng "|" (so như ký tự thường).
 */

/** Chuẩn hóa một chuỗi để so sánh. null/undefined/không phải chuỗi -> "". */
export function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Bài làm của HS có khớp đáp án không?
 * Bài làm bỏ trống (null, "", chỉ khoảng trắng) luôn sai,
 * kể cả khi đáp án (lỗi dữ liệu) cũng rỗng.
 */
export function isSameText(student: unknown, expected: unknown): boolean {
  const normalizedStudent = normalizeText(student);
  if (normalizedStudent === "") return false;
  return normalizedStudent === normalizeText(expected);
}
