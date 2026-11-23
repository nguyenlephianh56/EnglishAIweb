import { useState } from "react";
import { Link } from "react-router-dom";
import ExerciseView from "./ExerciseView";
import AIFeedbackCard from "./shared/AIFeedbackCard";
import AnnotatedText from "./shared/AnnotatedText";
import ErrorList from "./shared/ErrorList";
import { EXERCISE_REGISTRY } from "./registry";
import { compareAnswer } from "./answerUtils";
import { LISTENING_EXTRAS, SAMPLES, WRITING_RESULT_SAMPLE } from "./mock/sampleExercises";
import type { AnswerableExerciseType, ExerciseValueMap } from "../../types/exercise";

const TYPES = Object.keys(EXERCISE_REGISTRY) as AnswerableExerciseType[];

function Section<T extends AnswerableExerciseType>({ type, locked }: { type: T; locked: boolean }) {
  const def = EXERCISE_REGISTRY[type] as unknown as {
    label: string;
    emptyValue: (c: unknown) => ExerciseValueMap[T];
    isAnswered: (v: ExerciseValueMap[T], c: unknown) => boolean;
  };
  const sample = SAMPLES[type];
  const [value, setValue] = useState<ExerciseValueMap[T]>(() => def.emptyValue(sample.content));
  const answered = def.isAnswered(value, sample.content);
  const verdict = type === "writing" || type === "speaking" ? [] : compareAnswer(type, sample.review.value, sample.review.correctAnswer);

  return (
    <section id={type} className="scroll-mt-24 space-y-5" aria-labelledby={`dev-${type}`}>
      <h2 id={`dev-${type}`} className="font-heading text-2xl font-extrabold text-slate-900">
        {def.label} <code className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-500">{type}</code>
      </h2>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-4 text-xs font-bold uppercase tracking-wider text-brand">Chế độ đang làm (answering)</p>
        <ExerciseView type={type} content={sample.content} value={value} onChange={setValue} mode="answering" disabled={locked} />
        <div className="mt-6 rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">
          <p className="mb-1 font-bold text-slate-400">
            value (body gửi backend) • isAnswered: <span className={answered ? "text-green-400" : "text-amber-300"}>{String(answered)}</span>
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(value)}</pre>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-4 text-xs font-bold uppercase tracking-wider text-brand">Chế độ xem lại (review)</p>
        <ExerciseView
          type={type}
          content={sample.content}
          value={sample.review.value}
          onChange={() => undefined}
          mode="review"
          result={{ correctAnswer: sample.review.correctAnswer, explanation: sample.review.explanation }}
        />
        {verdict.length > 0 && <p className="mt-4 text-xs text-slate-500">compareAnswer → {JSON.stringify(verdict)}</p>}
      </div>
    </section>
  );
}

/** Kết quả bài Viết: AnnotatedText + ErrorList + AIFeedbackCard dùng chung */
function WritingResultDemo() {
  const r = WRITING_RESULT_SAMPLE;
  const [active, setActive] = useState<number | null>(null);
  const [noCorrections, setNoCorrections] = useState(false);
  const errors = noCorrections ? r.errors.map((e) => ({ type: e.type, text: e.text })) : r.errors;
  return (
    <section id="writing-result" className="scroll-mt-24 space-y-5" aria-labelledby="dev-writing-result">
      <h2 id="dev-writing-result" className="font-heading text-2xl font-extrabold text-slate-900">
        Kết quả bài Viết <code className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-500">shared/</code>
      </h2>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={noCorrections} onChange={(e) => setNoCorrections(e.target.checked)} className="size-4 accent-indigo-600" />
        Giả lập chưa lộ đáp án (bỏ correction và explanation)
      </label>
      <AIFeedbackCard criteria={r.criteria} comment={r.comment} score={r.score} maxScore={r.maxScore} />
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <AnnotatedText text={r.text} errors={errors} activeIndex={active} onActiveChange={setActive} idPrefix="dev" />
        <div className="mt-6">
          <ErrorList errors={errors} text={r.text} activeIndex={active} onActiveChange={setActive} idPrefix="dev" />
        </div>
      </div>
      <AIFeedbackCard score={null} maxScore={10} comment="Thiếu criteria thì ẩn phần thanh, vẫn hiện nhận xét." />
    </section>
  );
}

/** Các tình huống đặc biệt của bài Nghe điền từ */
function ListeningExtras() {
  return (
    <section id="listening-extras" className="scroll-mt-24 space-y-5" aria-labelledby="dev-listening-extras">
      <h2 id="dev-listening-extras" className="font-heading text-2xl font-extrabold text-slate-900">
        Nghe điền từ: tình huống đặc biệt
      </h2>
      {LISTENING_EXTRAS.map((x) => (
        <ListeningExtra key={x.title} title={x.title} content={x.content} />
      ))}
    </section>
  );
}

function ListeningExtra({ title, content }: { title: string; content: (typeof LISTENING_EXTRAS)[number]["content"] }) {
  const [value, setValue] = useState<string[]>(() => Array.from({ length: content.blanks }, () => ""));
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="mb-4 text-xs font-bold uppercase tracking-wider text-brand">{title}</p>
      <ExerciseView type="listening_fill" content={content} value={value} onChange={setValue} mode="answering" />
    </div>
  );
}

/** /dev/exercises (chỉ có khi chạy `npm run dev`): xem thử từng renderer ở cả hai chế độ với dữ liệu mẫu. */
export default function DevExercisesPage() {
  const [locked, setLocked] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
        <Link to="/" className="text-sm font-bold text-slate-500 hover:text-brand">
          ← Về trang chủ
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Xem thử thành phần bài tập</h1>
        <p className="mt-2 text-slate-500">Trang dành cho lập trình viên, chỉ có khi chạy npm run dev. Dữ liệu mẫu nằm ở features/exercises/mock.</p>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav aria-label="Chuyển nhanh" className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <a key={t} href={`#${t}`} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">
                {EXERCISE_REGISTRY[t].label}
              </a>
            ))}
            <a href="#listening-extras" className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">
              Nghe: đặc biệt
            </a>
            <a href="#writing-result" className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">
              Kết quả Viết
            </a>
          </nav>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} className="size-4 accent-indigo-600" />
            Khóa nhập (disabled)
          </label>
        </div>

        <div className="mt-8 space-y-12">
          {TYPES.map((t) => (
            <Section key={t} type={t} locked={locked} />
          ))}
          <ListeningExtras />
          <WritingResultDemo />
        </div>
      </div>
    </div>
  );
}
