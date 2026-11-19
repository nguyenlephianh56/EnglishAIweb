/** Tên viết tắt của lớp cho tiêu đề cột: "Tiếng Anh 8A2" -> "8A2"; tên một từ dài thì cắt còn 6 ký tự. */
export function shortClassName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  if (parts.length > 1 && last.length <= 6) return last;
  return name.trim().length <= 6 ? name.trim() : name.trim().slice(0, 6);
}

export const MAX_HEATMAP_CLASSES = 6;
