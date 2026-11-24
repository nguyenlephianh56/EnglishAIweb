import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Flag } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Textarea from "../../components/ui/Textarea";
import Notice from "../account/Notice";
import { createReport } from "../../api/reports";
import { getErrorCode, getErrorMessage } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";

const LIMIT = 1000;

function reportErrorMessage(err: unknown): string {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined;
  if (status === 409 || getErrorCode(err) === "REPORT_ALREADY_OPEN") return "Bạn đã báo lỗi bài này và đang chờ xử lý.";
  if (status === 404) return "Không tìm thấy bài tập này.";
  if (status === 403) return "Tài khoản của bạn không thể báo lỗi bài này.";
  return getErrorMessage(err, "Không gửi được báo lỗi, vui lòng thử lại.");
}

/** Nút "Báo lỗi bài" (POST /reports). Chỉ HỌC SINH nhìn thấy: giáo viên và quản trị viên không có nút này. */
export default function ReportExerciseButton({ exerciseId }: { exerciseId: number }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: () => createReport({ exercise_id: exerciseId, reason: reason.trim() }),
    onSuccess: () => {
      setOpen(false);
      setSent(true);
    },
  });

  // Thông báo "đã gửi" tự ẩn sau vài giây
  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(() => setSent(false), 6000);
    return () => window.clearTimeout(t);
  }, [sent]);

  if (user?.role !== "STUDENT") return null;

  const length = reason.trim().length;
  const error = touched && length === 0 ? "Hãy mô tả lỗi bạn gặp." : length > LIMIT ? `Tối đa ${LIMIT} ký tự.` : undefined;

  function openModal() {
    setReason("");
    setTouched(false);
    setSent(false);
    mutation.reset();
    setOpen(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (length === 0 || length > LIMIT || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" className="-ml-4" leftIcon={<Flag />} onClick={openModal}>
        Báo lỗi bài
      </Button>
      {sent && <Notice type="success">Đã gửi báo lỗi, cảm ơn bạn.</Notice>}

      <Modal open={open} onClose={() => (mutation.isPending ? undefined : setOpen(false))} title="Báo lỗi bài này" description="Mô tả lỗi bạn gặp (đề sai, đáp án sai, âm thanh không phát...) để quản trị viên kiểm tra.">
        <form onSubmit={submit} noValidate>
          <Textarea
            label="Nội dung báo lỗi"
            limit={LIMIT}
            rows={5}
            required
            value={reason}
            error={error}
            disabled={mutation.isPending}
            onChange={(e) => setReason(e.target.value)}
          />
          {mutation.isError && (
            <div className="mt-4">
              <Notice type="error">{reportErrorMessage(mutation.error)}</Notice>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Gửi báo lỗi
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
