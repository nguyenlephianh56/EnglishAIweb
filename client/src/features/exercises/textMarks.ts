/**
 * Tìm vị trí lỗi trong bài viết. Backend chỉ trả `text` (đoạn sai), KHÔNG có vị trí,
 * nên tìm lại chuỗi đó trong bài. Dùng chung cho màn chấm bài (giáo viên) và trang kết quả (học sinh).
 */
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
export function locateErrors(essay: string, errors: { text: string }[]): LocatedErrors {
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
