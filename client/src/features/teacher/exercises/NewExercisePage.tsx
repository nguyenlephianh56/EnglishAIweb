import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { createExercise } from "../../../api/exercises";
import { getErrorMessage } from "../../../api/client";
import ExerciseForm from "./form/ExerciseForm";
import { useExerciseForm } from "./form/useExerciseForm";
import { refreshExerciseCaches } from "./exerciseCache";
import { useExerciseBase } from "./useExerciseBase";

/**
 * /teacher/exercises/new và /admin/library/new: tạo bài tập mới (POST /exercises).
 * Giáo viên: luôn lưu bản nháp. Quản trị viên: có ô "Đăng ngay vào thư viện" (publish: true).
 */
export default function NewExercisePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useExerciseForm("create");
  const { isAdmin, listPath, listLabel } = useExerciseBase();
  const [publish, setPublish] = useState(false);

  const mutation = useMutation({
    mutationFn: createExercise,
    onSuccess: (created) => {
      refreshExerciseCaches(queryClient);
      if (!isAdmin) navigate("/teacher/exercises?tab=draft");
      else navigate(listPath, { state: { notice: publish ? `Đã đăng bài “${created.topic}” vào thư viện.` : `Đã lưu bài “${created.topic}” ở trạng thái nháp.` } });
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
      <Link
        to={listPath}
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {listLabel}
      </Link>
      <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Tạo bài tập mới</h1>
      <p className="mt-2 text-slate-500">{isAdmin ? "Soạn bài theo dạng bạn chọn. Có thể lưu nháp hoặc đăng ngay vào thư viện." : "Soạn bài theo dạng bạn chọn. Bài mới được lưu vào tab “Bản nháp”."}</p>

      <div className="mt-8">
        <ExerciseForm
          mode="create"
          form={form}
          pending={mutation.isPending}
          error={mutation.isError ? getErrorMessage(mutation.error, "Không lưu được bài tập, vui lòng thử lại.") : undefined}
          submitLabel={isAdmin && publish ? "Đăng vào thư viện" : "Lưu bản nháp"}
          cancelTo={listPath}
          extra={
            isAdmin ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <input type="checkbox" checked={publish} disabled={mutation.isPending} onChange={(e) => setPublish(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand" />
                <span>
                  <span className="block text-sm font-bold text-slate-900">Đăng ngay vào thư viện</span>
                  <span className="block text-sm text-slate-500">Bài được xuất bản luôn, không qua bước duyệt. Bỏ chọn để lưu bản nháp.</span>
                </span>
              </label>
            ) : undefined
          }
          onSubmit={() => mutation.mutate(isAdmin && publish ? { ...form.buildCreateBody(), publish: true } : form.buildCreateBody())}
        />
      </div>
    </div>
  );
}
