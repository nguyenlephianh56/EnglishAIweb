import type { FieldErrors } from "./types";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Bắt buộc (nếu required) và không quá `max` ký tự sau khi trim. Ghi lỗi vào `errors[key]`. */
export function checkText(errors: FieldErrors, key: string, value: string, label: string, max: number, required = true) {
  const v = value.trim();
  if (!v) {
    if (required) errors[key] = `Vui lòng nhập ${label}`;
    return;
  }
  if (v.length > max) errors[key] = `${cap(label)} tối đa ${max} ký tự`;
}

/** Số nguyên trong [min, max] từ chuỗi thô; trả undefined nếu không hợp lệ */
export function parseIntIn(raw: string, min: number, max: number): number | undefined {
  const v = raw.trim();
  if (!/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

export const replaceAt = <T,>(arr: readonly T[], i: number, value: T): T[] => arr.map((x, k) => (k === i ? value : x));
export const removeAt = <T,>(arr: readonly T[], i: number): T[] => arr.filter((_, k) => k !== i);

/** Đổi độ dài mảng chuỗi về n: giữ giá trị cũ theo vị trí, thêm "" nếu thiếu, cắt nếu thừa */
export const resizeStrings = (arr: readonly string[], n: number): string[] => Array.from({ length: n }, (_, i) => arr[i] ?? "");

/** "A", "B", "C"... cho lựa chọn trắc nghiệm */
export const optionLetter = (i: number) => String.fromCharCode(65 + i);
