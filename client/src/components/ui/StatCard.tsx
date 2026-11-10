import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  /** Lớp màu nền + màu icon của ô icon, ví dụ "bg-brand-light text-brand" */
  tint: string;
  label: string;
  value: string;
  /** Dòng nhỏ bên dưới số */
  sub: string;
  /** Lớp màu chữ của dòng nhỏ, ví dụ "text-green-600" */
  subClass: string;
  loading?: boolean;
}

/** Thẻ số liệu: ô icon màu nhạt bên trái, nhãn nhỏ, số lớn và dòng chú thích. */
export default function StatCard({ icon: Icon, tint, label, value, sub, subClass, loading }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${tint}`} aria-hidden="true">
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        {loading ? (
          <div className="mt-1 h-9 w-24 animate-pulse rounded-lg bg-slate-200" role="status" aria-label="Đang tải" />
        ) : (
          <p className="font-heading text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
        )}
        <p className={`mt-0.5 text-xs font-semibold ${subClass}`}>{loading ? "\u00A0" : sub}</p>
      </div>
    </div>
  );
}
