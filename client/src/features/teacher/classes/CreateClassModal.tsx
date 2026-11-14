import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Notice from "../../account/Notice";
import { createClass } from "../../../api/classes";
import { getErrorMessage } from "../../../api/client";
import { TEACHER_CLASSES_KEY } from "../useTeacherData";
import type { ClassSummary } from "../../../types/teacher";

const MAX_NAME = 100;

interface CreateClassModalProps {
  open: boolean;
  onClose: () => void;
  /** Gọi sau khi tạo thành công (trước khi đóng), để trang hiện thông báo */
  onCreated?: (created: ClassSummary) => void;
}

export default function CreateClassModal({ open, onClose, onCreated }: CreateClassModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string>();

  const mutation = useMutation({
    mutationFn: createClass,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: TEACHER_CLASSES_KEY }); // làm mới danh sách lớp
      onCreated?.(created);
      onClose();
    },
  });

  // Mở lại thì form sạch
  useEffect(() => {
    if (!open) {
      setName("");
      setFieldError(undefined);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (value.length === 0) return setFieldError("Tên lớp không được để trống");
    if (value.length > MAX_NAME) return setFieldError(`Tên lớp không được vượt quá ${MAX_NAME} ký tự`);
    setFieldError(undefined);
    mutation.mutate(value);
  }

  return (
    <Modal open={open} onClose={onClose} title="Tạo lớp mới" description="Mã lớp sẽ được tạo tự động để học sinh tham gia.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input
          label="Tên lớp"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (fieldError) setFieldError(undefined);
          }}
          maxLength={MAX_NAME + 20} // cho gõ lố một chút để hiện được lỗi thay vì chặn im lặng
          placeholder="Ví dụ: Tiếng Anh 8A2"
          error={fieldError}
          autoComplete="off"
        />
        {mutation.isError && <Notice type="error">{getErrorMessage(mutation.error, "Không tạo được lớp, vui lòng thử lại.")}</Notice>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Tạo lớp
          </Button>
        </div>
      </form>
    </Modal>
  );
}
