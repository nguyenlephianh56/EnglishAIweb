import { DynamicExerciseView } from "../../exercises/ExerciseView";
import { fromPayloadFor, isAnswerableType } from "../../exercises/registry";
import { ExplanationBox } from "../../exercises/renderers/ReviewParts";
import { asObj, asStr } from "./form/parse";
import type { AnswerableExerciseType } from "../../../types/exercise";

interface ExercisePreviewProps {
  type: string;
  content: unknown;
  answer: unknown;
  explanation?: string | null;
}

/**
 * Xem trước bài như học sinh sẽ thấy khi xem lại đáp án (chế độ review của renderer): hiện đáp án đúng và giải thích.
 * Viết và Nói không có đáp án nên chỉ hiện đề bài.
 */
export default function ExercisePreview({ type, content, answer, explanation }: ExercisePreviewProps) {
  if (type === "writing" || type === "speaking") {
    const c = asObj(content);
    const minWords = typeof c.minWords === "number" ? c.minWords : 0;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Đề bài</p>
          <p className="whitespace-pre-line text-[15px] leading-7 text-slate-800">{asStr(c.prompt) || "(chưa có đề bài)"}</p>
          {type === "writing" && minWords > 0 && <p className="mt-2 text-sm font-semibold text-slate-500">Viết ít nhất {minWords} từ.</p>}
        </div>
        {type === "speaking" && asStr(c.sample) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Bài nói mẫu</p>
            <p className="whitespace-pre-line text-[15px] leading-7 text-slate-800">{asStr(c.sample)}</p>
          </div>
        )}
        <ExplanationBox text={explanation} />
      </div>
    );
  }

  if (!isAnswerableType(type)) {
    return <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Dạng bài “{type}” chưa xem trước được.</p>;
  }
  // Đáp án đúng dùng làm bài làm mẫu để renderer đánh dấu đúng và hiện đáp án
  const value = fromPayloadFor(type as AnswerableExerciseType, answer, content as never);
  return <DynamicExerciseView type={type} content={content} value={value} onChange={() => undefined} mode="review" result={{ correctAnswer: value, explanation }} />;
}
