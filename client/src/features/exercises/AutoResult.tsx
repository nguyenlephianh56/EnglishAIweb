import { Check, Info, X } from "lucide-react";
import { DynamicExerciseView } from "./ExerciseView";
import { compareAnswer } from "./answerUtils";
import { fromPayloadFor, isAnswerableType, progressFor } from "./registry";
import type { AnswerableExerciseType, ExerciseContentMap } from "../../types/exercise";
import type { AttemptDetail, StudentExercise } from "../../types/attempt";

/**
 * Kết quả bài chấm tự động: hiện lại bài với đúng/sai từng câu (renderer chế độ review).
 * Đáp án chỉ có khi được lộ (tự luyện: ngay; bài giao: sau hạn nộp); chưa lộ thì chỉ hiện bài đã làm và dòng báo.
 */
export default function AutoResult({ attempt, exercise }: { attempt: AttemptDetail; exercise: StudentExercise | undefined }) {
  const revealed = attempt.answer !== undefined && attempt.answer !== null;

  if (!exercise || !isAnswerableType(exercise.type)) {
    return (
      <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
        Không tải được nội dung bài để xem lại. Điểm của em vẫn được lưu ở trên.
        {!revealed && " Đáp án sẽ hiện sau hạn nộp."}
      </p>
    );
  }

  const type = exercise.type as AnswerableExerciseType;
  const content = exercise.content as ExerciseContentMap[AnswerableExerciseType];
  const value = fromPayloadFor(type, attempt.submittedAnswer, content as never);
  const verdict = revealed ? compareAnswer(type, value as never, attempt.answer as never) : [];
  const unit = progressFor(type, value as never, content as never);
  const explanation = attempt.explanation ?? exercise.explanation ?? undefined;
  const detailed = attempt.errors.filter((e) => e.explanation && e.explanation.trim() !== "");

  return (
    <div>
      {!revealed && (
        <p role="status" className="mb-5 flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-sky-800">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          Đáp án sẽ hiện sau hạn nộp. Trong lúc chờ, em chỉ xem được điểm và bài mình đã làm.
        </p>
      )}

      {verdict.length > 0 && (
        <div className="mb-6" aria-label="Tóm tắt đúng sai">
          <p className="mb-2 text-sm font-bold text-slate-900">Kết quả từng {type === "matching" ? "cặp" : unit.total === verdict.length && type !== "multiple_choice" ? "chỗ" : "câu"}</p>
          <ul className="flex flex-wrap gap-2">
            {verdict.map((ok, i) => (
              <li key={i} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {ok ? <Check className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
                {i + 1}
                <span className="sr-only">{ok ? " đúng" : " sai"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DynamicExerciseView
        type={exercise.type}
        content={exercise.content}
        value={value}
        onChange={() => undefined}
        mode="review"
        result={revealed ? { correctAnswer: attempt.answer, explanation } : undefined}
      />

      {revealed && detailed.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-bold text-slate-900">Giải thích chi tiết</p>
          <ul className="mt-3 space-y-3 text-sm text-slate-700">
            {detailed.map((e, i) => (
              <li key={i}>
                {e.text && (
                  <p className="font-semibold">
                    <span className="text-red-600 line-through">{e.text}</span>
                    {e.correction && (
                      <>
                        <span className="mx-2 text-slate-400">→</span>
                        <span className="text-green-700">{e.correction}</span>
                      </>
                    )}
                  </p>
                )}
                <p className="mt-0.5 text-slate-600">{e.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
