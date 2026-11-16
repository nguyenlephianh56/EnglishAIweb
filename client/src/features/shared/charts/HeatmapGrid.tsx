interface HeatmapGridProps {
  rows: string[];
  cols: string[];
  /** values[hàng][cột], thang 0–100 */
  values: number[][];
  /** Chỉ số cột được tô viền (ví dụ lớp đang chọn) */
  selectedCol?: number;
  /** Tiêu đề ẩn cho trình đọc màn hình */
  caption?: string;
}

/** 5 mức indigo nhạt → đậm. Chữ tối trên 4 mức đầu, chữ trắng trên mức đậm nhất (đều đủ tương phản). */
const LEVELS = [
  { bg: "#EEF2FF", text: "#334155" },
  { bg: "#C7D2FE", text: "#1E293B" },
  { bg: "#A5B4FC", text: "#0F172A" },
  { bg: "#818CF8", text: "#0F172A" },
  { bg: "#4F46E5", text: "#FFFFFF" },
];

export const heatLevel = (v: number) => Math.min(LEVELS.length - 1, Math.max(0, Math.floor(v / 20)));

/** Lưới nhiệt hàng × cột, dùng <table> để đọc được bằng trình đọc màn hình; cuộn ngang ở màn nhỏ. */
export default function HeatmapGrid({ rows, cols, values, selectedCol, caption = "Bản đồ nhiệt" }: HeatmapGridProps) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-separate border-spacing-0 text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <td className="w-20" />
              {cols.map((c, ci) => (
                <th key={`${c}-${ci}`} scope="col" className={`px-1 pb-2 text-center font-bold ${ci === selectedCol ? "text-brand" : "text-slate-400"}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r}>
                <th scope="row" className="w-20 whitespace-nowrap pr-3 text-left font-semibold text-slate-500">
                  {r}
                </th>
                {cols.map((c, ci) => {
                  const raw = values[ri]?.[ci];
                  const known = typeof raw === "number" && Number.isFinite(raw);
                  const v = known ? Math.round(Math.min(100, Math.max(0, raw))) : 0;
                  const level = LEVELS[heatLevel(v)];
                  const selected = ci === selectedCol;
                  const side = selected ? "border-l-brand border-r-brand" : "border-l-transparent border-r-transparent";
                  const top = selected && ri === 0 ? "border-t-brand rounded-t-xl" : "border-t-transparent";
                  const bottom = selected && ri === rows.length - 1 ? "border-b-brand rounded-b-xl" : "border-b-transparent";
                  const label = known ? `${r} ở ${c}: ${v}%` : `${r} ở ${c}: chưa có dữ liệu`;
                  return (
                    <td key={`${r}-${c}-${ci}`} title={label} className={`border-2 p-0 ${side} ${top} ${bottom}`}>
                      <div className="m-1 grid h-8 place-items-center rounded-lg text-[11px] font-bold sm:h-9" style={known ? { backgroundColor: level.bg, color: level.text } : { backgroundColor: "#F8FAFC", color: "#94A3B8" }}>
                        <span aria-hidden="true">{known ? `${v}%` : "—"}</span>
                        <span className="sr-only">{label}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 text-xs font-semibold text-slate-500" aria-hidden="true">
        <span>Thấp</span>
        {LEVELS.map((l) => (
          <span key={l.bg} className="size-4 rounded" style={{ backgroundColor: l.bg }} />
        ))}
        <span>Cao</span>
      </div>
    </div>
  );
}
