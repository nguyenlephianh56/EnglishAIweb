/** Giao diện thẻ lớp: màu xoay vòng theo id lớp (indigo, teal, tím, xanh dương) và tên viết tắt. */
const GRADIENTS = [
  "bg-linear-to-br from-indigo-600 to-indigo-400",
  "bg-linear-to-br from-teal-600 to-teal-400",
  "bg-linear-to-br from-violet-600 to-violet-400",
  "bg-linear-to-br from-sky-600 to-sky-400",
] as const;

export const classGradient = (id: number) => GRADIENTS[Math.abs(id) % GRADIENTS.length];

/**
 * Tên viết tắt hiện trên khối màu: ưu tiên từ cuối có chữ số ("Tiếng Anh 8A2" -> "8A2",
 * "Luyện thi vào 10" -> "10"); không có thì ghép chữ cái đầu các từ ("English Club" -> "EC").
 */
export function classAbbr(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const numbered = [...words].reverse().find((w) => /\d/.test(w));
  if (numbered) return numbered.slice(0, 4).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
