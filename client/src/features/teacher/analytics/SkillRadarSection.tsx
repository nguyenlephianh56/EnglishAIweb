import { lazy, Suspense } from "react";
import { ANALYSIS_SKILLS, toPercent } from "./analysisMeta";
import type { LibrarySkill } from "../../../types/library";

// Recharts khá nặng: tải riêng khi cần
const SkillRadarChart = lazy(() => import("../../shared/charts/SkillRadarChart"));

/** Radar 5 trục (Nghe, Nói, Đọc, Viết, Nền tảng) từ điểm 0–10; kỹ năng chưa có dữ liệu tính 0 và được ghi chú bên dưới. */
export default function SkillRadarSection({ scores, subject }: { scores: Record<LibrarySkill, number | null>; subject: string }) {
  const data = ANALYSIS_SKILLS.map(({ skill, axis }) => ({ axis, value: scores[skill] == null ? 0 : toPercent(scores[skill] as number) }));
  const missing = ANALYSIS_SKILLS.filter(({ skill }) => scores[skill] == null).map((s) => s.axis);
  const label = `Biểu đồ radar năng lực ${subject}: ${ANALYSIS_SKILLS.map(({ skill, axis }, i) => `${axis} ${scores[skill] == null ? "chưa có dữ liệu" : data[i].value}`).join(", ")}`;

  return (
    <>
      <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-slate-100" role="status" aria-label="Đang tải biểu đồ" />}>
        <SkillRadarChart data={data} height={300} ariaLabel={label} />
      </Suspense>
      {missing.length > 0 && <p className="mt-2 text-center text-xs text-slate-500">Chưa có dữ liệu: {missing.join(", ")} (tính là 0 trên biểu đồ).</p>}
    </>
  );
}
