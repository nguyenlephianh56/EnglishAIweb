import { useState } from "react";
import { CircleAlert, School, UserPlus } from "lucide-react";
import Button from "../../../components/ui/Button";
import Notice from "../../account/Notice";
import { useTeacherClasses } from "../useTeacherData";
import ClassCard, { ClassCardSkeleton } from "./ClassCard";
import CreateClassModal from "./CreateClassModal";

/** /teacher/classes: danh sách lớp của giáo viên (GET /classes) + tạo lớp mới. */
export default function ClassesPage() {
  const { data, isLoading, isError, refetch } = useTeacherClasses();
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const classes = data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Lớp học</h1>
          <p className="mt-2 text-slate-500">Quản lý lớp và theo dõi tiến độ học sinh.</p>
        </div>
        <Button size="lg" rightIcon={<UserPlus />} onClick={() => setCreateOpen(true)}>
          Tạo lớp mới
        </Button>
      </div>

      {notice && (
        <div className="mt-6">
          <Notice type="success">{notice}</Notice>
        </div>
      )}

      <div className="mt-8">
        {isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              Không tải được danh sách lớp.
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </div>
        ) : isLoading ? (
          <div className="grid gap-5 lg:grid-cols-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <ClassCardSkeleton key={i} />
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
              <School className="size-6" />
            </span>
            <p className="mt-3 font-heading text-lg font-bold text-slate-900">Thầy/cô chưa có lớp nào</p>
            <p className="mt-1 text-sm text-slate-500">Tạo lớp đầu tiên rồi chia sẻ mã lớp để học sinh tham gia.</p>
            <div className="mt-5">
              <Button rightIcon={<UserPlus />} onClick={() => setCreateOpen(true)}>
                Tạo lớp mới
              </Button>
            </div>
          </div>
        ) : (
          <ul className="grid gap-5 lg:grid-cols-2">
            {classes.map((c) => (
              <li key={c.id}>
                <ClassCard item={c} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateClassModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => setNotice(`Đã tạo lớp “${created.name}”. Mã lớp: ${created.code}`)}
      />
    </div>
  );
}
