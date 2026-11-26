import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Textarea from "../../components/ui/Textarea";
import Notice from "../account/Notice";
import type { ExerciseListItem } from "../../types/exercise";

export const REJECT_REASON_LIMIT = 1000;

interface BaseProps {
  open: boolean;
  topic: string;
  pending: boolean;
  /** Lỗi từ máy chủ, hiện trong hộp thoại */
  error?: string;
  onClose: () => void;
}

/** Xác nhận duyệt: PROPOSED -> PUBLISHED và vào thư viện chung. */
export function ApproveModal({ open, topic, pending, error, onClose, onConfirm }: BaseProps & { onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={() => (pending ? undefined : onClose())} title="Duyệt bài này?" description={`Bài “${topic}” sẽ được xuất bản và xuất hiện trong thư viện chung cho giáo viên và học sinh.`}>
      {error && <Notice type="error">{error}</Notice>}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" disabled={pending} onClick={onClose}>
          Hủy
        </Button>
        <Button leftIcon={<Check />} loading={pending} onClick={onConfirm}>
          Duyệt
        </Button>
      </div>
    </Modal>
  );
}

/** Từ chối: bài quay về bản nháp. Lý do (không bắt buộc, tối đa 1000 ký tự) chỉ lưu trong nhật ký, giáo viên không nhận được. */
export function RejectModal({ open, topic, pending, error, onClose, onConfirm }: BaseProps & { onConfirm: (reason: string | undefined) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const tooLong = reason.trim().length > REJECT_REASON_LIMIT;

  return (
    <Modal open={open} onClose={() => (pending ? undefined : onClose())} title="Từ chối bài này?" description={`Bài “${topic}” sẽ quay về bản nháp của người tạo.`}>
      <Textarea
        label="Lý do (không bắt buộc)"
        hint="Lý do chỉ được lưu trong nhật ký hệ thống, giáo viên không nhìn thấy."
        limit={REJECT_REASON_LIMIT}
        rows={4}
        value={reason}
        disabled={pending}
        error={tooLong ? `Tối đa ${REJECT_REASON_LIMIT} ký tự.` : undefined}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <div className="mt-4">
          <Notice type="error">{error}</Notice>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" disabled={pending} onClick={onClose}>
          Hủy
        </Button>
        <Button variant="danger" leftIcon={<X />} loading={pending} disabled={tooLong} onClick={() => onConfirm(reason.trim() || undefined)}>
          Từ chối
        </Button>
      </div>
    </Modal>
  );
}

/** Ẩn bài khỏi thư viện và các bài đã giao. */
export function HideModal({ open, topic, pending, error, onClose, onConfirm }: BaseProps & { onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={() => (pending ? undefined : onClose())} title="Ẩn bài này?" description={`Bài “${topic}” sẽ bị ẩn khỏi thư viện và các bài đã giao.`}>
      {error && (
        <div className="mt-4">
          <Notice type="error">{error}</Notice>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" disabled={pending} onClick={onClose}>
          Hủy
        </Button>
        <Button variant="danger" leftIcon={<EyeOff />} loading={pending} onClick={onConfirm}>
          Ẩn bài
        </Button>
      </div>
    </Modal>
  );
}

export function canPublishDirectly(exercise: ExerciseListItem, adminId: number | undefined) {
  return exercise.status === "HIDDEN" ||
    (exercise.status === "DRAFT" && (exercise.source === "ADMIN" || (adminId !== undefined && exercise.createdById === adminId)));
}

export function PublishModal({ open, topic, pending, error, hidden, onClose, onConfirm }: BaseProps & { hidden: boolean; onConfirm: () => void }) {
  return (
    <Modal
      open={open}
      onClose={() => (pending ? undefined : onClose())}
      title={hidden ? "Hiện lại bài này?" : "Xuất bản bài này?"}
      description={`Bài “${topic}” sẽ được xuất bản và học sinh có thể làm bài trong Thư viện luyện tập.`}
    >
      {error && <Notice type="error">{error}</Notice>}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" disabled={pending} onClick={onClose}>Hủy</Button>
        <Button leftIcon={<Eye />} loading={pending} onClick={onConfirm}>{hidden ? "Hiện lại" : "Xuất bản"}</Button>
      </div>
    </Modal>
  );
}