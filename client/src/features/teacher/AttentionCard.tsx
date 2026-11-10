import { ArrowRight, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import { initials } from "../../components/layout/AppLayout";
import type { AttentionKind, AttentionStudent } from "../../types/teacher";

const REASON_TONE: Record<AttentionKind, string> = {
  MISSING: "bg-red-50 text-red-700",
  SCORE_DROP: "bg-amber-50 text-amber-700",
  WEAK_SKILL: "bg-orange-50 text-orange-700",
};

const AVATAR_TONES = ["bg-pink-100 text-pink-700", "bg-amber-100 text-amber-700", "bg-orange-100 text-orange-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700"];

export default function AttentionCard({ students }: { students: AttentionStudent[] }) {
  return (
    <section className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-attention">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="h-attention" className="font-heading text-xl font-bold text-slate-900">
            Học sinh cần chú ý
          </h2>
          <p className="mt-1 text-sm text-slate-500">AI phát hiện dựa trên tiến độ gần đây</p>
        </div>
        <span className="shrink-0 rounded-full bg-brand-light px-3 py-1.5 text-xs font-bold text-brand">{students.length} học sinh</span>
      </div>

      {students.length === 0 ? (
        <p className="mt-6 flex-1 text-sm text-slate-500">Chưa có học sinh nào cần chú ý. Mọi người đang theo kịp tiến độ.</p>
      ) : (
        <ul className="mt-4 flex-1 divide-y divide-slate-100">
          {students.map((s, i) => (
            <li key={s.id}>
              {/* TODO: trỏ tới trang phân tích của từng học sinh khi có */}
              <Link
                to="/teacher/analytics"
                className="-mx-2 flex items-center gap-4 rounded-2xl px-2 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
              >
                <span className={`grid size-11 shrink-0 place-items-center rounded-full text-xs font-bold ${AVATAR_TONES[i % AVATAR_TONES.length]}`} aria-hidden="true">
                  {initials(s.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">{s.name}</span>
                  <span className="block truncate text-xs text-slate-500">{s.className}</span>
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${REASON_TONE[s.kind]}`}>{s.reason}</span>
                <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2">
        <Button to="/teacher/analytics" variant="ghost" size="sm" className="-ml-4" rightIcon={<ArrowRight />}>
          Xem phân tích chi tiết
        </Button>
      </div>
    </section>
  );
}
