import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { createExercise } from "../../../api/exercises";
import { getErrorMessage } from "../../../api/client";
import ExerciseForm from "./form/ExerciseForm";
import { useExerciseForm } from "./form/useExerciseForm";
import { TEACHER_EXERCISES_KEY } from "./useTeacherExercises";

/** /teacher/exercises/new: tạo bài tập mới (POST /exercises). Bài mới luôn lưu ở trạng thái nháp. */
export default function NewExercisePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useExerciseForm("create");

  const mutation = useMutation({
    mutationFn: createExercise,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TEACHER_EXERCISES_KEY });
      navigate("/teacher/exercises?tab=draft");
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
      <Link
        to="/teacher/exercises"
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Ngân hàng bài tập
      </Link>
      <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Tạo bài tập mới</h1>
      <p className="mt-2 text-slate-500">Soạn bài theo dạng bạn chọn. Bài mới được lưu vào tab “Bản nháp”.</p>

      <div className="mt-8">
        <ExerciseForm
          mode="create"
          form={form}
          pending={mutation.isPending}
          error={mutation.isError ? getErrorMessage(mutation.error, "Không lưu được bài tập, vui lòng thử lại.") : undefined}
          submitLabel="Lưu bản nháp"
          onSubmit={() => mutation.mutate(form.buildCreateBody())}
        />
      </div>
    </div>
  );
}
