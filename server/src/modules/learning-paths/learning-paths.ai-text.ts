// =====================================================================
// learning-paths/learning-paths.ai-text.ts — Làm sạch văn bản cho lộ trình AI (T24). Hàm THUẦN, không DB/env.
//
// Dùng cho 2 việc:
//   - `topic` của bài (do GV/AI nhập) trước khi đưa vào prompt;
//   - `title` do AI viết trước khi lưu DB.
// Mục tiêu: một dòng chữ thường, không thẻ HTML, không ký tự điều khiển/xuống dòng, không quá dài.
// Lưu ý: hàm KHÔNG đổi nghĩa câu chữ (vd "bỏ qua hướng dẫn" vẫn còn); việc coi nó là DỮ LIỆU do thẻ bọc trong prompt làm.
// =====================================================================

/** Ký tự điều khiển (C0, DEL, C1), tách dòng/đoạn, ký tự độ rộng 0 và ký tự đổi chiều chữ (bidi), BOM. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Một thẻ HTML/comment hoàn chỉnh: `<...>`. */
const HTML_TAG = /<[^<>]*>/g;

/** Cắt theo ký tự Unicode (không chẻ đôi cặp surrogate như emoji). */
const truncateChars = (text: string, max: number): string => {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
};

/**
 * Làm sạch thành một dòng: bỏ thẻ HTML, đổi ký tự điều khiển/xuống dòng thành khoảng trắng, gộp khoảng trắng,
 * trim, cắt tối đa `max` ký tự. Trả chuỗi rỗng nếu không còn gì. `max` <= 0 -> chuỗi rỗng.
 */
export const sanitizeOneLine = (input: unknown, max: number): string => {
  if (typeof input !== "string" || !Number.isInteger(max) || max <= 0) return "";

  let text = input.replace(CONTROL_CHARS, " ");
  // Lặp đến khi hết thẻ: "<<b>script>" sau lần 1 còn "<script>".
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(HTML_TAG, " ");
  }
  // `<` hoặc `>` còn sót (thẻ dở dang) cũng bỏ.
  text = text.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();

  return truncateChars(text, max).trim();
};

/** `topic` đưa vào prompt: làm sạch + cắt; rỗng -> null. */
export const sanitizeTopicForPrompt = (topic: unknown, max: number): string | null => {
  const clean = sanitizeOneLine(topic, max);
  return clean === "" ? null : clean;
};