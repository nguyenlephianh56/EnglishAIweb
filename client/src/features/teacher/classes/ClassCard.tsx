import { User } from "lucide-react";
import Button from "../../../components/ui/Button";
import CopyCodeButton from "./CopyCodeButton";
import { classAbbr, classGradient } from "./classTheme";
import { formatNumber } from "../../../utils/format";
import type { ClassSummary } from "../../../types/teacher";

const MAX_AVATARS = 2;

/** Chồng avatar trang trí + "+N". Backend chưa trả tên học sinh trong danh sách lớp nên avatar chỉ là biểu tượng. */
function AvatarStack({ count }: { count: number }) {
  if (count <= 0) return null;
  const shown = Math.min(count, MAX_AVATARS);
  const rest = count - shown;
  return (
    <div className="absolute bottom-4 left-4 flex -space-x-2" aria-hidden="true">
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="grid size-8 place-items-center rounded-full border-2 border-white/80 bg-white/90 text-slate-500">
          <User className="size-4" />
        </span>
      ))}
      {rest > 0 && <span className="grid size-8 place-items-center rounded-full border-2 border-white/80 bg-white/90 text-[11px] font-bold text-slate-600">+{formatNumber(rest)}</span>}
    </div>
  );
}

export default function ClassCard({ item: c }: { item: ClassSummary }) {
  return (
    <article className="flex overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className={`relative w-28 shrink-0 overflow-hidden sm:w-40 ${classGradient(c.id)}`} aria-hidden="true">
        <span className="absolute -right-10 -top-10 size-32 rounded-full bg-white/10" />
        <span className="absolute -right-4 top-6 size-20 rounded-full bg-white/10" />
        <span className="absolute inset-0 grid place-items-center px-2 font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{classAbbr(c.name)}</span>
        <AvatarStack count={c.studentCount} />
      </div>

      <div className="min-w-0 flex-1 p-5">
        <h2 className="truncate font-heading text-lg font-bold text-slate-900" title={c.name}>
          {c.name}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{formatNumber(c.studentCount)} học sinh</p>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="min-w-0 text-xs text-slate-500">
            Mã lớp <span className="ml-1.5 font-mono text-sm font-bold tracking-wider text-slate-900">{c.code}</span>
          </p>
          <CopyCodeButton code={c.code} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button to={`/teacher/classes/${c.id}`} variant="outline" size="sm" fullWidth>
            Xem lớp
          </Button>
          <Button to={`/teacher/assignments/new?classId=${c.id}`} variant="ghost" size="sm" fullWidth>
            Giao bài
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ClassCardSkeleton() {
  return <div className="h-52 animate-pulse rounded-3xl bg-slate-200" role="status" aria-label="Đang tải" />;
}
