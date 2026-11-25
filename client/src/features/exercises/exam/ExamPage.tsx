import { useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, CircleAlert, Play, Timer } from "lucide-react";
import Button from "../../../components/ui/Button";
import { ANY_SKILL_META } from "../../student/skillMeta";
import ExerciseRunner from "../ExerciseRunner";
import { BackLink, PageError, PageSkeleton } from "../RunnerShell";
import { exerciseTypeLabel, isAnswerableType } from "../registry";
import { usePracticeExercise } from "../useExerciseData";
import { examDurationSec, formatClock, loadExamSession, saveExamSession } from "./examConfig";
import type { ExamSession } from "./examConfig";
import type { StudentExercise } from "../../../types/attempt";

const LIBRARY = "/student/library";

function StartScreen({ exercise, durationSec, onStart }: { exercise: StudentExercise; durationSec: number; onStart: () => void }) {
  const skill = ANY_SKILL_META[exercise.skill] ?? ANY_SKILL_META.FOUNDATION;
  const SkillIcon = skill.icon;
  const rules = [
    "Đồng hồ chạy ngay khi bấm Bắt đầu và không thể tạm dừng.",
    "Hết giờ hệ thống tự nộp phần em đã làm.",
    "Rời trang không dừng đồng hồ.",
    ...(exercise.type === "writing" ? ["Bài Viết cần đủ số từ tối thiểu mới nộp được."] : []),
    ...(exercise.type === "speaking" ? ["Bài Nói tối đa 2 phút ghi âm."] : []),
  ];

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 lg:px-8">
      <BackLink to={LIBRARY}>Thư viện luyện tập</BackLink>
      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="exam-title">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-600">
          <Timer className="size-4" aria-hidden="true" />
          Thi thử
        </p>
        <h1 id="exam-title" className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-slate-900">
          {exercise.topic}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${skill.tint} ${skill.text}`}>
            <SkillIcon className="size-3.5" aria-hidden="true" />
            {skill.label}
          </span>
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">{exercise.level}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{exerciseTypeLabel(exercise.type)}</span>
        </p>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Thời gian làm bài</p>
          <p className="mt-1 font-heading text-3xl font-extrabold text-slate-900">
            {formatClock(durationSec)} <span className="text-base font-bold text-slate-500">phút</span>
          </p>
        </div>

        <ul className="mt-6 space-y-2 text-sm text-slate-700">
          {rules.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" leftIcon={<Play />} onClick={onStart}>
            Bắt đầu thi
          </Button>
          <Button size="lg" variant="outline" to={LIBRARY} leftIcon={<ArrowLeft />}>
            Quay lại thư viện
          </Button>
        </div>
      </section>
    </div>
  );
}

function ExamInner({ id }: { id: number }) {
  const query = usePracticeExercise(id);
  // Phiên thi đã lưu: tải lại trang thì thi tiếp (hoặc ở trạng thái hết giờ), không được cấp thêm giờ
  const [session, setSession] = useState<ExamSession | null>(() => loadExamSession(id));

  if (!Number.isInteger(id) || id <= 0) {
    return <PageError error={new Error("Bài tập không hợp lệ.")} onRetry={() => undefined} backTo={LIBRARY} backLabel="Thư viện luyện tập" />;
  }
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) return <PageError error={query.error} onRetry={() => void query.refetch()} backTo={LIBRARY} backLabel="Thư viện luyện tập" />;

  const exercise = query.data;
  if (!isAnswerableType(exercise.type)) {
    return <PageError error={new Error("Dạng bài này chưa hỗ trợ thi thử trên web.")} onRetry={() => undefined} backTo={LIBRARY} backLabel="Thư viện luyện tập" />;
  }

  if (session) {
    return <ExerciseRunner key={exercise.id} exercise={exercise} exam={{ ...session, onRestart: () => setSession(null) }} />;
  }

  const durationSec = examDurationSec(exercise);
  return (
    <StartScreen
      exercise={exercise}
      durationSec={durationSec}
      onStart={() => {
        const next = { deadline: Date.now() + durationSec * 1000, durationSec };
        saveExamSession(exercise.id, next);
        setSession(next);
      }}
    />
  );
}

/** /student/library/:id/exam: thi thử có giới hạn thời gian cho một bài thư viện (nộp y như luyện tập). */
export default function ExamPage() {
  const id = Number(useParams().id);
  return <ExamInner key={id} id={id} />;
}
