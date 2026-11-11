import { ArrowRight, BookOpen, Clock, Headphones, Layers, Mic, PenLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Button from "../../components/ui/Button";
import type { ExerciseSummary, LibrarySkill } from "../../types/library";

// Màu phần đầu thẻ theo kỹ năng: nền nhạt, màu nhãn, màu ô icon
const TONE: Record<LibrarySkill, { label: string; icon: LucideIcon; soft: string; text: string; solid: string }> = {
  LISTENING: { label: "Nghe", icon: Headphones, soft: "bg-violet-100", text: "text-violet-700", solid: "bg-skill-listening" },
  SPEAKING: { label: "Nói", icon: Mic, soft: "bg-orange-100", text: "text-orange-700", solid: "bg-skill-speaking" },
  READING: { label: "Đọc", icon: BookOpen, soft: "bg-sky-100", text: "text-sky-700", solid: "bg-skill-reading" },
  WRITING: { label: "Viết", icon: PenLine, soft: "bg-pink-100", text: "text-pink-700", solid: "bg-skill-writing" },
  FOUNDATION: { label: "Nền tảng", icon: Layers, soft: "bg-green-100", text: "text-green-700", solid: "bg-green-500" },
};

interface LibraryCardProps {
  exercise: ExerciseSummary;
  /** Cấp độ hiện tại của học sinh, dùng để hiện nhãn "Phù hợp với bạn" */
  studentLevel?: string;
}

export default function LibraryCard({ exercise: e, studentLevel }: LibraryCardProps) {
  const tone = TONE[e.skill];
  const Icon = tone.icon;
  const matches = studentLevel !== undefined && e.level === studentLevel;

  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {/* Phần đầu: màu theo kỹ năng, ô icon nghiêng và vài đường chéo mờ */}
      <div className={`relative h-40 overflow-hidden ${tone.soft}`} aria-hidden="true">
        <svg className="absolute right-0 top-0 h-full w-3/4 text-slate-900" viewBox="0 0 240 160" fill="none" preserveAspectRatio="xMaxYMid slice">
          <line x1="40" y1="160" x2="230" y2="10" stroke="currentColor" strokeOpacity="0.14" />
          <line x1="70" y1="160" x2="240" y2="30" stroke="currentColor" strokeOpacity="0.12" />
          <line x1="100" y1="160" x2="240" y2="52" stroke="currentColor" strokeOpacity="0.1" />
        </svg>
        <span className={`absolute left-8 top-8 text-xs font-bold ${tone.text}`}>{tone.label}</span>
        <span className={`absolute right-8 top-1/2 grid size-20 -translate-y-1/2 rotate-12 place-items-center rounded-3xl text-white shadow-lg ${tone.solid}`}>
          <Icon className="size-9" />
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">{e.level}</span>
          {matches && <span className="text-xs font-bold text-green-600">Phù hợp với bạn</span>}
        </div>
        <h3 className="mt-3 font-heading text-lg font-bold text-slate-900">{e.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-slate-500">{e.description}</p>

        <div className="mt-auto pt-5">
          <p className="flex items-center gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden="true" />
              {e.durationMin} phút
            </span>
            <span>{e.aiGraded ? "AI chấm" : `${e.questionCount} câu`}</span>
          </p>
          <div className="mt-4">
            <Button to={`/student/library/${e.id}`} fullWidth rightIcon={<ArrowRight />}>
              Bắt đầu
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
