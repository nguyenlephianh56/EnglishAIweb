import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown } from "lucide-react";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Notice from "../../account/Notice";
import { createAssignment } from "../../../api/assignments";
import { getErrorMessage } from "../../../api/client";
import { useTeacherClasses } from "../useTeacherData";
import ExercisePicker from "./ExercisePicker";
import { TEACHER_ASSIGNMENTS_KEY } from "./useTeacherAssignments";
import { toLocalInputValue } from "./assignmentMeta";
import type { ExerciseListItem } from "../../../types/exercise";

interface FieldErrors {
  classId?: string;
  exercise?: string;
  dueAt?: string;
}

/** /teacher/assignments/new: chọn lớp (đọc sẵn ?classId=), chọn bài tập, đặt hạn nộp rồi POST /assignments. */
export default function NewAssignmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const classes = useTeacherClasses();
  const teacherClasses = classes.data ?? [];

  const [classId, setClassId] = useState("");
  const [exercise, setExercise] = useState<ExerciseListItem | null>(null);
  const [dueLocal, setDueLocal] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  // Chọn sẵn lớp theo ?classId= (chỉ một lần, và chỉ khi lớp đó thuộc giáo viên này)
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || !classes.isSuccess) return;
    preselected.current = true;
    const wanted = params.get("classId");
    if (wanted && teacherClasses.some((c) => String(c.id) === wanted)) setClassId(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.isSuccess]);

  const mutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEACHER_ASSIGNMENTS_KEY });
      const className = teacherClasses.find((c) => String(c.id) === classId)?.name ?? "lớp đã chọn";
      navigate("/teacher/assignments", { state: { notice: `Đã giao bài “${exercise?.topic ?? ""}” cho lớp ${className}.` } });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    if (!classId) next.classId = "Vui lòng chọn lớp";
    if (!exercise) next.exercise = "Vui lòng chọn bài tập";
    if (!dueLocal) next.dueAt = "Vui lòng chọn hạn nộp";
    else {
      const due = new Date(dueLocal);
      if (Number.isNaN(due.getTime())) next.dueAt = "Hạn nộp không hợp lệ";
      else if (due.getTime() <= Date.now()) next.dueAt = "Hạn nộp phải ở tương lai";
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !exercise) return;
    // new Date(giờ máy).toISOString() cho chuỗi ISO 8601 có múi giờ (Z) đúng như backend yêu cầu
    mutation.mutate({ exerciseId: exercise.id, classId: Number(classId), dueAt: new Date(dueLocal).toISOString() });
  }

  const noClasses = classes.isSuccess && teacherClasses.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
      <Link
        to="/teacher/assignments"
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Bài đã giao
      </Link>
      <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Giao bài tập</h1>
      <p className="mt-2 text-slate-500">Chọn lớp, bài tập và hạn nộp. Học sinh trong lớp sẽ nhận bài ngay.</p>

      {classes.isError ? (
        <div className="mt-6">
          <Notice type="error">Không tải được danh sách lớp. Hãy tải lại trang.</Notice>
        </div>
      ) : noClasses ? (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="font-heading text-lg font-bold text-slate-900">Thầy/cô chưa có lớp nào</p>
          <p className="mt-1 text-sm text-slate-500">Tạo lớp trước rồi mới giao bài được.</p>
          <div className="mt-5">
            <Button to="/teacher/classes">Đến trang Lớp học</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-8 space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div>
            <label htmlFor="assign-class" className="mb-1.5 block text-sm font-bold text-slate-900">
              Lớp
            </label>
            <div className="relative">
              <select
                id="assign-class"
                value={classId}
                disabled={classes.isLoading}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setErrors((p) => ({ ...p, classId: undefined }));
                }}
                aria-invalid={errors.classId ? true : undefined}
                aria-describedby={errors.classId ? "assign-class-error" : undefined}
                className={`h-12 w-full appearance-none rounded-xl border bg-white pl-4 pr-10 text-sm text-slate-900 outline-none transition-colors focus:ring-4 disabled:bg-slate-50 ${
                  errors.classId ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-brand focus:ring-brand/20"
                }`}
              >
                <option value="">{classes.isLoading ? "Đang tải lớp..." : "Chọn lớp"}</option>
                {teacherClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.studentCount} học sinh)
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            </div>
            {errors.classId && (
              <p id="assign-class-error" role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
                {errors.classId}
              </p>
            )}
          </div>

          <ExercisePicker
            value={exercise}
            onChange={(e) => {
              setExercise(e);
              setErrors((p) => ({ ...p, exercise: undefined }));
            }}
            error={errors.exercise}
          />

          <Input
            label="Hạn nộp"
            type="datetime-local"
            value={dueLocal}
            min={toLocalInputValue(new Date())}
            onChange={(e) => {
              setDueLocal(e.target.value);
              setErrors((p) => ({ ...p, dueAt: undefined }));
            }}
            error={errors.dueAt}
          />

          {mutation.isError && <Notice type="error">{getErrorMessage(mutation.error, "Không giao được bài, vui lòng thử lại.")}</Notice>}

          <div className="flex justify-end gap-3 pt-2">
            <Button to="/teacher/assignments" variant="outline">
              Hủy
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Giao bài
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
