import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Notice from "../../account/Notice";
import { addStudentToClass } from "../../../api/classes";
import { getErrorMessage } from "../../../api/client";
import { TEACHER_CLASSES_KEY } from "../useTeacherData";
import type { ClassStudent } from "../../../types/teacher";

interface AddStudentModalProps {
  open: boolean;
  onClose: () => void;
  classId: number;
  onAdded?: (student: ClassStudent) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddStudentModal({ open, onClose, classId, onAdded }: AddStudentModalProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string>();

  const mutation = useMutation({
    mutationFn: (value: string) => addStudentToClass(classId, value),
    onSuccess: (student) => {
      queryClient.invalidateQueries({ queryKey: TEACHER_CLASSES_KEY }); // danh sách lớp + chi tiết lớp (sĩ số)
      onAdded?.(student);
      onClose();
    },
  });

  useEffect(() => {
    if (!open) {
      setEmail("");
      setFieldError(undefined);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (value.length === 0) return setFieldError("Vui lòng nhập email");
    if (!EMAIL_PATTERN.test(value)) return setFieldError("Email không hợp lệ");
    setFieldError(undefined);
    mutation.mutate(value);
  }

  return (
    <Modal open={open} onClose={onClose} title="Thêm học sinh" description="Nhập email tài khoản học sinh đã đăng ký trên EnglishAI.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input
          label="Email học sinh"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldError) setFieldError(undefined);
            if (mutation.isError) mutation.reset();
          }}
          placeholder="hocsinh@example.com"
          error={fieldError}
          autoComplete="off"
        />
        {mutation.isError && <Notice type="error">{getErrorMessage(mutation.error, "Không thêm được học sinh, vui lòng thử lại.")}</Notice>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Thêm vào lớp
          </Button>
        </div>
      </form>
    </Modal>
  );
}
