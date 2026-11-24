import type { ReactNode } from "react";

/** Khung thẻ dùng chung cho các khối kết quả phân tích */
export default function AnalysisCard({ id, title, subtitle, badge, children, className = "" }: { id: string; title: string; subtitle?: string; badge?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 ${className}`} aria-labelledby={id}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={id} className="font-heading text-xl font-bold text-slate-900">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {badge}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
