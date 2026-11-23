import { useMemo, useState } from "react";
import AutoResult from "../../exercises/AutoResult";
import AnnotatedText from "../../exercises/shared/AnnotatedText";
import ErrorList from "../../exercises/shared/ErrorList";
import { countWords } from "./gradingMeta";
import type { AttemptReview } from "../../../types/attemptReview";
import type { AttemptDetail, StudentExercise } from "../../../types/attempt";

const answerText = (review: AttemptReview) => {
  const text = (review.submitted_answer as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text : "";
};

const card = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";

/** Bài Viết: bài làm có đoạn lỗi gạch đỏ kèm số và danh sách lỗi (giáo viên thấy cả gợi ý sửa và giải thích). */
function WritingView({ review }: { review: AttemptReview }) {
  const text = answerText(review);
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="space-y-6">
      <section className={card} aria-labelledby="sv-essay">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sv-essay" className="font-heading text-lg font-bold text-slate-900">
            Bài làm của học sinh
          </h2>
          <span className="text-sm text-slate-500">{countWords(text)} từ</span>
        </div>
        <div className="mt-4">
          <AnnotatedText text={text} errors={review.errors} activeIndex={active} onActiveChange={setActive} idPrefix="grade" />
        </div>
      </section>
      <section className={card} aria-labelledby="sv-errors">
        <h2 id="sv-errors" className="font-heading text-lg font-bold text-slate-900">
          Lỗi AI tìm thấy ({review.errors.length})
        </h2>
        <div className="mt-4">
          <ErrorList errors={review.errors} text={text} activeIndex={active} onActiveChange={setActive} idPrefix="grade" />
        </div>
      </section>
    </div>
  );
}

/** Bài Nói: bản chữ lời nói (bản ghi âm đã bị xóa sau khi chấm) với các từ phát âm chưa tốt được tô, kèm danh sách từ. */
function SpeakingView({ review }: { review: AttemptReview }) {
  const transcript = answerText(review);
  const [active, setActive] = useState<number | null>(null);
  // Chỉ lỗi phát âm; bỏ `correction` vì nó chỉ lặp lại chính từ đó
  const words = useMemo(() => review.errors.filter((e) => e.type === "pronunciation" && e.text.trim() !== "").map((e) => ({ type: e.type, text: e.text, explanation: e.explanation })), [review.errors]);
  return (
    <div className="space-y-6">
      <section className={card} aria-labelledby="sv-transcript">
        <h2 id="sv-transcript" className="font-heading text-lg font-bold text-slate-900">
          Lời học sinh đã nói
        </h2>
        <p className="mt-1 text-sm text-slate-500">Bản chữ do AI nghe và ghi lại{words.length > 0 ? ". Từ gạch đỏ là từ phát âm chưa tốt." : "."}</p>
        <div className="mt-4">
          {transcript === "" ? <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Không có bản chữ.</p> : <AnnotatedText text={transcript} errors={words} activeIndex={active} onActiveChange={setActive} idPrefix="grade" />}
        </div>
      </section>
      <section className={card} aria-labelledby="sv-words">
        <h2 id="sv-words" className="font-heading text-lg font-bold text-slate-900">
          Từ cần luyện{words.length > 0 ? ` (${words.length})` : ""}
        </h2>
        {words.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-800">AI không thấy từ nào phát âm sai.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {words.map((w, i) => (
              <li key={i}>
                <button
                  type="button"
                  aria-pressed={active === i}
                  onClick={() => setActive(active === i ? null : i)}
                  className={`flex w-full flex-col gap-1 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 ${active === i ? "border-red-300 bg-red-50/60" : "border-slate-100 hover:bg-slate-50"}`}
                >
                  <span className="text-sm font-bold text-red-600">{w.text}</span>
                  {w.explanation && <span className="text-sm text-slate-600">{w.explanation}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Dạng chấm tự động: xem lại bài làm so với đáp án đúng bằng AutoResult (renderer chế độ review) của trang kết quả học sinh. */
function AutoView({ review }: { review: AttemptReview }) {
  const { exercise } = review;
  const attempt: AttemptDetail = {
    attemptId: review.attempt_id,
    score: review.score,
    maxScore: review.max_score,
    graded: review.score !== null,
    correct: 0,
    total: 0,
    errors: review.errors,
    answer: exercise.answer,
    explanation: exercise.explanation,
    exerciseId: exercise.id,
    assignmentId: review.assignment.id,
    mode: "assignment",
    attemptNo: 0,
    submittedAnswer: review.submitted_answer,
    teacherScore: review.teacher_score,
    finalScore: review.final_score,
    teacherComment: review.teacher_comment,
    isLate: review.is_late,
    submittedAt: review.submitted_at,
  };
  const studentExercise: StudentExercise = { id: exercise.id, type: exercise.type, skill: exercise.skill, level: exercise.level, topic: exercise.topic, content: exercise.content, explanation: exercise.explanation };
  return (
    <section className={card} aria-labelledby="sv-auto">
      <h2 id="sv-auto" className="mb-4 font-heading text-lg font-bold text-slate-900">
        Bài làm của học sinh
      </h2>
      <AutoResult attempt={attempt} exercise={studentExercise} />
    </section>
  );
}

/** Cột trái của màn chấm: hiện bài nộp theo dạng bài. */
export default function SubmissionView({ review }: { review: AttemptReview }) {
  switch (review.exercise.type) {
    case "writing":
      return <WritingView review={review} />;
    case "speaking":
      return <SpeakingView review={review} />;
    default:
      return <AutoView review={review} />;
  }
}
