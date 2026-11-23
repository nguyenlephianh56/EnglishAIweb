/** Đọc dữ liệu không rõ kiểu (content/answer từ backend) một cách phòng thủ */
export const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
export const asStrs = (v: unknown): string[] => arr(v).map(asStr);
export const asInt = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isInteger(v) ? v : fallback);

/** So sánh sâu hai giá trị JSON (không phụ thuộc thứ tự khóa của object) */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
