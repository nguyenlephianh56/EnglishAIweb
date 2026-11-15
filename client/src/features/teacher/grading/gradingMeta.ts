import { formatDate, formatTime } from "../../../utils/format";
import type { CriteriaKey, WritingCriteria, WritingError } from "../../../types/grading";

export const CRITERIA: { key: CriteriaKey; label: string }[] = [
  { key: "content", label: "Nội dung" },
  { key: "coherence", label: "Mạch lạc" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "grammar", label: "Ngữ pháp" },
];

/** Điểm tổng AI gợi ý: trung bình 4 tiêu chí, làm tròn 1 chữ số thập phân */
export const averageScore = (c: WritingCriteria) => Math.round(((c.content + c.coherence + c.vocabulary + c.grammar) / 4) * 10) / 10;

/** 7.5 -> "7,5" */
export const formatScore = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

/** Đọc điểm người dùng gõ (chấp nhận dấu phẩy "7,5"). Trả NaN nếu rỗng hoặc không phải số. */
export function parseScore(raw: string): number {
  const s = raw.trim().replace(",", ".");
  if (s === "") return Number.NaN;
  return Number(s);
}
export const isValidScore = (n: number) => Number.isFinite(n) && n >= 0 && n <= 10;

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${formatTime(d)}, ${formatDate(d)}`;
};

const GROUP_LABEL: Record<string, string> = {
  grammar: "Ngữ pháp",
  vocabulary: "Từ vựng",
  spelling: "Chính tả",
  punctuation: "Dấu câu",
  coherence: "Mạch lạc",
  content: "Nội dung",
};
/** "grammar:tense" -> "Ngữ pháp"; nhóm lạ thì giữ nguyên chữ */
export const errorGroupLabel = (type: string) => {
  const group = type.split(":")[0]?.trim().toLowerCase() ?? "";
  return GROUP_LABEL[group] ?? (group || "Khác");
};

// ---------- Tìm vị trí lỗi trong bài ----------
// Backend chỉ trả `text` (đoạn sai), không có vị trí; nên tìm lại chuỗi đó trong bài.

export interface ErrorRange {
  /** Chỉ số của lỗi trong mảng errors */
  index: number;
  start: number;
  end: number;
}

export interface LocatedErrors {
  ranges: ErrorRange[];
  /** Chỉ số các lỗi không tìm thấy trong bài (chỉ liệt kê bên dưới) */
  unmatched: number[];
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Vị trí chuỗi `needle` trong `hay` từ `from`, bắt buộc khớp nguyên từ ("travel" không khớp trong "traveled") */
function indexOfWhole(hay: string, needle: string, from: number): number {
  let i = hay.indexOf(needle, from);
  while (i !== -1) {
    const before = i > 0 ? hay[i - 1] : "";
    const after = i + needle.length < hay.length ? hay[i + needle.length] : "";
    const startsWord = WORD_CHAR.test(needle[0]);
    const endsWord = WORD_CHAR.test(needle[needle.length - 1]);
    const okBefore = !startsWord || !before || !WORD_CHAR.test(before);
    const okAfter = !endsWord || !after || !WORD_CHAR.test(after);
    if (okBefore && okAfter) return i;
    i = hay.indexOf(needle, i + 1);
  }
  return -1;
}

/**
 * Với mỗi lỗi, tìm lần xuất hiện đầu tiên của `text` trong bài mà chưa bị lỗi khác chiếm (khớp đúng chữ hoa/thường trước,
 * không được thì không phân biệt hoa/thường). Không tìm thấy thì đưa vào `unmatched`.
 */
export function locateErrors(essay: string, errors: WritingError[]): LocatedErrors {
  const ranges: ErrorRange[] = [];
  const unmatched: number[] = [];
  const lowerEssay = essay.toLowerCase();
  const overlaps = (s: number, e: number) => ranges.some((r) => s < r.end && e > r.start);

  errors.forEach((err, index) => {
    const needle = err.text.trim();
    if (!needle) {
      unmatched.push(index);
      return;
    }
    for (const [hay, n] of [[essay, needle], [lowerEssay, needle.toLowerCase()]] as const) {
      let from = 0;
      let found = -1;
      while (from <= hay.length) {
        const i = indexOfWhole(hay, n, from);
        if (i === -1) break;
        if (!overlaps(i, i + n.length)) {
          found = i;
          break;
        }
        from = i + 1;
      }
      if (found !== -1) {
        ranges.push({ index, start: found, end: found + n.length });
        return;
      }
    }
    unmatched.push(index);
  });

  ranges.sort((a, b) => a.start - b.start);
  return { ranges, unmatched };
}

export interface TextSegment {
  text: string;
  /** Có giá trị khi đoạn này là một lỗi (chỉ số trong mảng errors) */
  errorIndex?: number;
}

/** Cắt bài thành các đoạn thường và đoạn lỗi theo thứ tự xuất hiện */
export function splitByErrors(essay: string, ranges: ErrorRange[]): TextSegment[] {
  const out: TextSegment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) out.push({ text: essay.slice(cursor, r.start) });
    out.push({ text: essay.slice(r.start, r.end), errorIndex: r.index });
    cursor = r.end;
  }
  if (cursor < essay.length) out.push({ text: essay.slice(cursor) });
  return out;
}
