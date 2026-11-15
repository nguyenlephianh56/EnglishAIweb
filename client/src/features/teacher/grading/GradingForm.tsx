import { useState } from "react";
import type { FormEvent } from "react";
import { Sparkles } from "lucide-react";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Notice from "../../account/Notice";
import { getErrorMessage } from "../../../api/client";
import { averageScore, CRITERIA, formatDateTime, formatScore, isValidScore, parseScore } from "./gradingMeta";
import { useSaveGrading } from "./useGrading";
import type { CriteriaKey, GradingSubmission } from "../../../types/grading";

type Fields = Record<CriteriaKey | "total", string>;

const toText = (n: number) => formatScore(n);

function initialFields(s: GradingSubmission): Fields {
  const base = s.teacher ?? { criteria: s.ai.criteria, total: averageScore(s.ai.criteria) };
  return { ...Object.fromEntries(CRITERIA.map((c) => [c.key, toText(base.criteria[c.key])])), total: toText(base.total) } as Fields;
}

/** Cột phải: 4 ô điểm theo tiêu chí backend, điểm tổng, nhận xét, lưu, lịch sử. Gắn `key={submission.id}` để đổi bài thì nạp lại. */
export default function GradingForm({ submission }: { submission: GradingSubmission }) {
  const save = useSaveGrading(submission.id);
  const [fields, setFields] = useState<Fields>(() => initialFields(submission));
  const [comment, setComment] = useState(submission.teacher?.comment ?? submission.ai.comment);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [saved, setSaved] = useState(false);
  // Điểm tổng tự tính lại theo 4 tiêu chí cho đến khi giáo viên tự sửa ô "Điểm tổng"
  const [totalTouched, setTotalTouched] = useState(Boolean(submission.teacher));

  function setCriterion(key: CriteriaKey, value: string) {
    setSaved(false);
    setErrors((p) => ({ ...p, [key]: undefined, total: undefined }));
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      if (!totalTouched) {
        const nums = CRITERIA.map((c) => parseScore(next[c.key]));
        if (nums.every(isValidScore)) next.total = toText(averageScore({ content: nums[0], coherence: nums[1], vocabulary: nums[2], grammar: nums[3] }));
      }
      return next;
    });
  }

  function applyAiScores() {
    setSaved(false);
    setErrors({});
    setTotalTouched(false);
    setFields({ ...Object.fromEntries(CRITERIA.map((c) => [c.key, toText(submission.ai.criteria[c.key])])), total: toText(averageScore(submission.ai.criteria)) } as Fields);
    setComment(submission.ai.comment);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const next: Partial<Record<keyof Fields, string>> = {};
    const values = {} as Record<keyof Fields, number>;
    (Object.keys(fields) as (keyof Fields)[]).forEach((k) => {
      const n = parseScore(fields[k]);
      values[k] = n;
      if (fields[k].trim() === "") next[k] = "Nhập điểm từ 0 đến 10";
      else if (!isValidScore(n)) next[k] = "Điểm phải từ 0 đến 10";
    });
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    save.mutate(
      {
        criteria: { content: values.content, coherence: values.coherence, vocabulary: values.vocabulary, grammar: values.grammar },
        total: values.total,
        comment: comment.trim(),
      },
      { onSuccess: () => setSaved(true) }
    );
  }

  const aiTotal = averageScore(submission.ai.criteria);

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
        <Sparkles className="size-5 text-brand" aria-hidden="true" />
        Phân tích và gợi ý từ AI
      </h2>

      <div className="mt-5 grid grid-cols-2 gap-4">
        {CRITERIA.map((c) => (
          <div key={c.key}>
            <Input
              label={`${c.label} (0–10)`}
              inputMode="decimal"
              autoComplete="off"
              value={fields[c.key]}
              onChange={(e) => setCriterion(c.key, e.target.value)}
              error={errors[c.key]}
            />
            <p className="mt-1 text-xs text-slate-500">AI: {formatScore(submission.ai.criteria[c.key])}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
        <div className="flex-1">
          <Input
            label="Điểm tổng (0–10)"
            inputMode="decimal"
            autoComplete="off"
            value={fields.total}
            onChange={(e) => {
              setSaved(false);
              setTotalTouched(true);
              setErrors((p) => ({ ...p, total: undefined }));
              setFields((p) => ({ ...p, total: e.target.value }));
            }}
            error={errors.total}
          />
          <p className="mt-1 text-xs text-slate-500">AI gợi ý: {formatScore(aiTotal)}</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-8 shrink-0" onClick={applyAiScores}>
          Dùng điểm AI
        </Button>
      </div>

      <div className="mt-5">
        <label htmlFor="grading-comment" className="mb-1.5 block text-sm font-bold text-slate-900">
          Nhận xét cho học sinh
        </label>
        <textarea
          id="grading-comment"
          rows={6}
          maxLength={1000}
          value={comment}
          onChange={(e) => {
            setSaved(false);
            setComment(e.target.value);
          }}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20"
        />
        <p className="mt-1 text-right text-xs text-slate-400">{comment.length}/1000</p>
      </div>

      {save.isError && (
        <div className="mt-3">
          <Notice type="error">{getErrorMessage(save.error, "Không lưu được điểm, vui lòng thử lại.")}</Notice>
        </div>
      )}
      {saved && (
        <div className="mt-3">
          <Notice type="success">Đã lưu điểm chỉnh sửa.</Notice>
        </div>
      )}

      <Button type="submit" fullWidth className="mt-4" loading={save.isPending}>
        Lưu điểm chỉnh sửa
      </Button>

      <section className="mt-6 border-t border-slate-100 pt-5" aria-labelledby="grading-history">
        <h3 id="grading-history" className="text-sm font-bold text-slate-900">
          Lịch sử chỉnh sửa
        </h3>
        <ol className="mt-3 space-y-2">
          {submission.history.map((h, i) => {
            const prev = submission.history[i - 1];
            return (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-slate-700">
                  {h.by === "AI" ? "Điểm AI" : "Giáo viên"}: <strong className="text-slate-900">{formatScore(h.total)}</strong>
                  {prev && <span className="text-slate-400"> (từ {formatScore(prev.total)})</span>}
                </span>
                <span className="text-xs text-slate-400">{formatDateTime(h.at)}</span>
              </li>
            );
          })}
        </ol>
        {submission.history.length > 1 && (
          <p className="mt-2 text-xs text-slate-500">
            {submission.history.map((h) => `${h.by === "AI" ? "AI" : "Giáo viên"} ${formatScore(h.total)}`).join(" → ")}
          </p>
        )}
      </section>
    </form>
  );
}
