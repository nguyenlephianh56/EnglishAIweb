import { ArrowRight, Check } from "lucide-react";
import Button from "../../components/ui/Button";
import { typeLabel } from "../teacher/assignments/assignmentMeta";
import { ANY_SKILL_META } from "./skillMeta";
import type { PathItem } from "../../types/path";

interface PathItemCardProps {
  item: PathItem;
  /** Đang gửi thay đổi lên máy chủ: khóa ô tròn */
  busy: boolean;
  onToggle: (item: PathItem) => void;
}

const CHIP = "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600";

/** Một mục của lộ trình tuần: ô tròn tự đánh dấu hoàn thành, tên mục, thông tin bài và nút làm bài. */
export default function PathItemCard({ item, busy, onToggle }: PathItemCardProps) {
  const ex = item.exercise;
  const skill = ex ? (ANY_SKILL_META[ex.skill] ?? ANY_SKILL_META.FOUNDATION) : null;

  return (
    <article className={`flex flex-wrap items-center gap-4 rounded-3xl border bg-white p-5 shadow-sm sm:p-6 ${item.done ? "border-green-200" : "border-slate-200"}`}>
      <button
        type="button"
        aria-pressed={item.done}
        aria-label={`Đánh dấu đã hoàn thành: ${item.title}`}
        disabled={busy}
        onClick={() => onToggle(item)}
        className={`grid size-9 shrink-0 place-items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 disabled:cursor-wait disabled:opacity-60 ${
          item.done ? "border-green-500 bg-green-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-brand"
        }`}
      >
        <Check className="size-5" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1">
        <h3 className={`font-heading text-lg font-bold ${item.done ? "text-slate-400 line-through" : "text-slate-900"}`}>{item.title}</h3>
        {ex && skill && (
          <p className="mt-2 flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${skill.tint} ${skill.text}`}>{skill.label}</span>
            <span className={CHIP}>{ex.level}</span>
            <span className={CHIP}>{typeLabel(ex.type)}</span>
          </p>
        )}
      </div>

      {ex ? (
        <Button to={`/student/library/${ex.id}`} variant={item.done ? "outline" : "primary"} rightIcon={<ArrowRight />}>
          Làm bài
        </Button>
      ) : (
        <Button variant="outline" disabled>
          Bài không còn khả dụng
        </Button>
      )}
    </article>
  );
}
