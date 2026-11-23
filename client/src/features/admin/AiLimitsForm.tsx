import { useState } from "react";
import type { FormEvent } from "react";
import { CircleAlert, Save } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Notice from "../account/Notice";
import { getErrorMessage } from "../../api/client";
import { formatDate } from "../../utils/format";
import { AI_LIMIT_MAX, AI_LIMIT_MIN } from "./aiMeta";
import { useAiLimits, useUpdateAiLimits } from "./useAdminAi";
import type { AiLimits } from "../../types/adminAi";

/** Số nguyên 1..1000 hoặc thông báo lỗi */
function check(raw: string): string | undefined {
  const s = raw.trim();
  if (s === "") return "Hãy nhập số lượt.";
  if (!/^\d+$/.test(s)) return "Chỉ nhập số nguyên.";
  const n = Number(s);
  if (n < AI_LIMIT_MIN || n > AI_LIMIT_MAX) return `Từ ${AI_LIMIT_MIN} đến ${AI_LIMIT_MAX} lượt.`;
  return undefined;
}

export default function AiLimitsForm() {
  const query = useAiLimits();
  if (query.isLoading) return <div className="h-64 animate-pulse rounded-3xl bg-slate-200" role="status" aria-label="Đang tải" />;
  if (query.isError || !query.data) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        <span className="flex items-center gap-2">
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          {getErrorMessage(query.error, "Không tải được giới hạn lượt AI.")}
        </span>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }
  return <LimitsBody limits={query.data} />;
}

function LimitsBody({ limits }: { limits: AiLimits }) {
  const update = useUpdateAiLimits();
  const [student, setStudent] = useState(String(limits.student));
  const [teacher, setTeacher] = useState(String(limits.teacher));
  const [touched, setTouched] = useState(false);
  const [ok, setOk] = useState(false);

  const studentError = check(student);
  const teacherError = check(teacher);
  const unchanged = student.trim() === String(limits.student) && teacher.trim() === String(limits.teacher);
  // Máy chủ đang dùng giá trị mặc định (env): cho lưu ngay cả khi chưa sửa để chốt vào cơ sở dữ liệu
  const canSave = (!unchanged || limits.source === "env") && !studentError && !teacherError;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setOk(false);
    if (studentError || teacherError || update.isPending) return;
    try {
      const saved = await update.mutateAsync({ student: Number(student.trim()), teacher: Number(teacher.trim()) });
      setStudent(String(saved.student));
      setTeacher(String(saved.teacher));
      setTouched(false);
      setOk(true);
    } catch {
      /* lỗi hiện qua update.error */
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="limits-title">
      <h2 id="limits-title" className="font-heading text-xl font-bold text-slate-900">
        Giới hạn lượt AI mỗi ngày
      </h2>
      <p className="mt-1 text-sm text-slate-500">Số lần tối đa mỗi người được dùng tính năng AI (chấm bài, sinh bài...) trong một ngày.</p>

      {limits.source === "env" && (
        <div className="mt-4">
          <Notice type="warning">Đang dùng giá trị mặc định từ cấu hình máy chủ. Bấm Lưu để chốt giá trị này vào hệ thống.</Notice>
        </div>
      )}

      <form onSubmit={submit} noValidate className="mt-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Học sinh (lượt/ngày)" inputMode="numeric" autoComplete="off" value={student} error={touched ? studentError : undefined} disabled={update.isPending} onChange={(e) => setStudent(e.target.value)} />
          <Input label="Giáo viên (lượt/ngày)" inputMode="numeric" autoComplete="off" value={teacher} error={touched ? teacherError : undefined} disabled={update.isPending} onChange={(e) => setTeacher(e.target.value)} />
        </div>
        <p className="mt-4 text-sm text-slate-500">Có hiệu lực trong tối đa 30 giây.</p>

        {update.isError && (
          <div className="mt-4">
            <Notice type="error">{getErrorMessage(update.error, "Không lưu được giới hạn, vui lòng thử lại.")}</Notice>
          </div>
        )}
        {ok && (
          <div className="mt-4">
            <Notice type="success">Đã lưu giới hạn lượt AI.</Notice>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400">{limits.updated_at ? `Cập nhật ${formatDate(new Date(limits.updated_at))}` : "Chưa lưu lần nào"}</p>
          <Button type="submit" leftIcon={<Save />} loading={update.isPending} disabled={!canSave}>
            Lưu
          </Button>
        </div>
      </form>
    </section>
  );
}
