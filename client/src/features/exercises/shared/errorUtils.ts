/** Hàm thuần xử lý lỗi của bài Viết (không phụ thuộc React): tìm vị trí lỗi trong bài, nhóm lỗi. */

/** Một lỗi AI tìm thấy. Backend KHÔNG trả vị trí, chỉ có đoạn `text` sai. correction/explanation chỉ có khi được lộ. */
export interface WritingErrorItem {
  /** Dạng "nhóm:chi tiết", ví dụ "grammar:subject_verb_agreement" */
  type: string;
  text: string;
  correction?: string;
  explanation?: string;
}

export interface TextSegment {
  kind: "plain" | "error";
  text: string;
  /** Chỉ số lỗi trong mảng errors, có khi kind = "error" */
  errorIndex?: number;
}

export interface LocatedText {
  segments: TextSegment[];
  /** Chỉ số các lỗi không tìm thấy trong bài (hiển thị ở "Lỗi khác") */
  unplaced: number[];
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Khớp có nằm trọn từ không ("travel" không tính là khớp trong "traveled") */
function isWhole(text: string, start: number, end: number): boolean {
  const first = text[start];
  const last = text[end - 1];
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";
  return !(WORD_CHAR.test(first) && before && WORD_CHAR.test(before)) && !(WORD_CHAR.test(last) && after && WORD_CHAR.test(after));
}

/**
 * Tìm vị trí từng lỗi trong bài. Với mỗi lỗi (theo thứ tự) lấy lần xuất hiện đầu tiên của `text` chưa bị lỗi khác chiếm:
 * thử khớp chính xác, rồi không phân biệt hoa thường, rồi chuẩn hóa khoảng trắng; ưu tiên khớp trọn từ.
 * Text rỗng hoặc không tìm thấy thì vào `unplaced`. Cùng một đoạn sai lặp lại trong bài thì các lỗi lần lượt nhận các lần xuất hiện.
 */
export function locateErrors(text: string, errors: WritingErrorItem[]): LocatedText {
  const taken: { start: number; end: number; index: number }[] = [];
  const unplaced: number[] = [];
  const free = (s: number, e: number) => !taken.some((r) => s < r.end && e > r.start);

  errors.forEach((err, index) => {
    const needle = (err.text ?? "").trim();
    if (!needle) {
      unplaced.push(index);
      return;
    }
    const loose = needle.split(/\s+/).map(escapeRe).join("\\s+");
    const stages = [new RegExp(escapeRe(needle), "gu"), new RegExp(escapeRe(needle), "giu"), new RegExp(loose, "giu")];

    let hit: { start: number; end: number } | undefined;
    for (const wholeOnly of [true, false]) {
      for (const re of stages) {
        for (const m of text.matchAll(re)) {
          const start = m.index ?? 0;
          const end = start + m[0].length;
          if (end > start && free(start, end) && (!wholeOnly || isWhole(text, start, end))) {
            hit = { start, end };
            break;
          }
        }
        if (hit) break;
      }
      if (hit) break;
    }
    if (hit) taken.push({ ...hit, index });
    else unplaced.push(index);
  });

  taken.sort((a, b) => a.start - b.start);
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const r of taken) {
    if (r.start > cursor) segments.push({ kind: "plain", text: text.slice(cursor, r.start) });
    segments.push({ kind: "error", text: text.slice(r.start, r.end), errorIndex: r.index });
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ kind: "plain", text: text.slice(cursor) });
  return { segments, unplaced };
}

export type ErrorGroupKey = "grammar" | "vocabulary" | "spelling" | "punctuation" | "pronunciation" | "other";

export const ERROR_GROUPS: { key: ErrorGroupKey; label: string }[] = [
  { key: "grammar", label: "Ngữ pháp" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "spelling", label: "Chính tả" },
  { key: "punctuation", label: "Dấu câu" },
  { key: "pronunciation", label: "Phát âm" },
  { key: "other", label: "Khác" },
];

/** Nhóm lỗi theo tiền tố trước dấu ":" của type; không nhận ra thì là "Khác" */
export function errorGroup(type: string): { key: ErrorGroupKey; label: string } {
  const prefix = (type ?? "").split(":")[0].trim().toLowerCase();
  return ERROR_GROUPS.find((g) => g.key === prefix && g.key !== "other") ?? ERROR_GROUPS[ERROR_GROUPS.length - 1];
}

/** Phần sau dấu ":" viết hoa chữ đầu, bỏ gạch dưới: "grammar:subject_verb" -> "Subject verb". Không có thì undefined. */
export function errorDetail(type: string): string | undefined {
  const i = (type ?? "").indexOf(":");
  if (i === -1) return undefined;
  const s = type.slice(i + 1).replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined;
}

/** Nhãn đầy đủ: "Ngữ pháp · Subject verb" */
export function errorLabel(type: string): string {
  const detail = errorDetail(type);
  const g = errorGroup(type).label;
  return detail ? `${g} · ${detail}` : g;
}
