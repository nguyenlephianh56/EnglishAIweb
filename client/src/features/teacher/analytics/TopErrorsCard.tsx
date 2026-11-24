import { errorLabel } from "../../student/mapSkillProfile";
import AnalysisCard from "./AnalysisCard";
import type { TopError } from "../../../types/analysis";

/** "Lỗi thường gặp": các loại lỗi xếp hạng theo số lần, thanh dài tỉ lệ với lỗi nhiều nhất. */
export default function TopErrorsCard({ errors, subtitle, className }: { errors: TopError[]; subtitle: string; className?: string }) {
  const sorted = [...errors].sort((a, b) => b.count - a.count);
  const max = sorted[0]?.count ?? 0;

  return (
    <AnalysisCard id="an-errors" title="Lỗi thường gặp" subtitle={subtitle} className={className}>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa ghi nhận lỗi nào.</p>
      ) : (
        <ol className="space-y-3">
          {sorted.map((e, i) => (
            <li key={e.type}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 font-semibold text-slate-800">
                  <span className="mr-2 text-slate-400">{i + 1}.</span>
                  {errorLabel(e.type)}
                </span>
                <span className="shrink-0 font-bold text-slate-600">{e.count} lỗi</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${max === 0 ? 0 : Math.max(4, Math.round((e.count / max) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </AnalysisCard>
  );
}
