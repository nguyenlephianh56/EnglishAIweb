import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import Notice from "../../account/Notice";
import { removeStudentFromClass } from "../../../api/classes";
import { getErrorMessage } from "../../../api/client";
import { TEACHER_CLASSES_KEY } from "../useTeacherData";
import type { ClassStudent } from "../../../types/teacher";

interface RemoveStudentModalProps {
  /** Học sinh đang được xác nhận xóa; null = đóng */
  student: ClassStudent | null;
  className: string;
  classId: number;
  onClose: () => void;
  onRemoved?: (student: ClassStudent) => void;
}

export default function RemoveStudentModal({ student, className, classId, onClose, onRemoved }: RemoveStudentModalProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (studentId: number) => removeStudentFromClass(classId, studentId),
    onSuccess: (_result, studentId) => {
      queryClient.invalidateQueries({ queryKey: TEACHER_CLASSES_KEY });
      if (student && student.id === studentId) onRemoved?.(student);
      onClose();
    },
  });

  useEffect(() => {
    if (student === null) mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student]);

  return (
    <Modal
      open={student !== null}
      onClose={onClose}
      title="Xóa học sinh khỏi lớp?"
      description={student ? `${student.name} sẽ không còn thấy các bài giao của lớp ${className}. Học sinh có thể tham gia lại bằng mã lớp.` : undefined}
    >
      <div className="space-y-4">
        {mutation.isError && <Notice type="error">{getErrorMessage(mutation.error, "Không xóa được học sinh, vui lòng thử lại.")}</Notice>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button variant="danger" loading={mutation.isPending} onClick={() => student && mutation.mutate(student.id)}>
            Xóa khỏi lớp
          </Button>
        </div>
      </div>
    </Modal>
  );
}
