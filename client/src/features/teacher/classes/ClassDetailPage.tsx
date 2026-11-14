import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, CircleAlert, SearchX, UserMinus, UserPlus, Users } from "lucide-react";
import Button from "../../../components/ui/Button";
import Notice from "../../account/Notice";
import { UserAvatar } from "../../../components/layout/AppLayout";
import { getErrorMessage } from "../../../api/client";
import { formatDate, formatNumber } from "../../../utils/format";
import { useClassDetail } from "../useTeacherData";
import CopyCodeButton from "./CopyCodeButton";
import AddStudentModal from "./AddStudentModal";
import RemoveStudentModal from "./RemoveStudentModal";
import type { ClassStudent } from "../../../types/teacher";

function BackLink() {
  return (
    <Link
      to="/teacher/classes"
      className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Lớp học
    </Link>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

/** /teacher/classes/:id: thông tin lớp, mã lớp, danh sách học sinh, thêm/xóa học sinh. */
export default function ClassDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data, isLoading, isError, error, refetch } = useClassDetail(id);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<ClassStudent | null>(null);
  const [notice, setNotice] = useState<string>();

  const idValid = Number.isInteger(id) && id > 0;
  const notFound = !idValid || (isError && axios.isAxiosError(error) && error.response?.status === 404);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <BackLink />

      {notFound ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <SearchX className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Không tìm thấy lớp</p>
          <p className="mt-1 text-sm text-slate-500">Lớp không tồn tại hoặc không thuộc tài khoản của thầy/cô.</p>
          <div className="mt-5">
            <Button to="/teacher/classes" variant="outline">
              Về danh sách lớp
            </Button>
          </div>
        </div>
      ) : isError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            {getErrorMessage(error, "Không tải được thông tin lớp.")}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      ) : isLoading || !data ? (
        <div className="mt-6 space-y-5" aria-busy="true" role="status" aria-label="Đang tải">
          <Skeleton className="h-36" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{data.name}</h1>
              <p className="mt-2 text-slate-500">
                {formatNumber(data.studentCount)} học sinh • Tạo ngày {formatDate(new Date(data.createdAt))}
              </p>
              <div className="mt-4 inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                <p className="text-xs text-slate-500">
                  Mã lớp <span className="ml-1.5 font-mono text-base font-bold tracking-wider text-slate-900">{data.code}</span>
                </p>
                <CopyCodeButton code={data.code} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button to={`/teacher/assignments/new?classId=${data.id}`} variant="outline">
                Giao bài
              </Button>
              <Button leftIcon={<UserPlus />} onClick={() => setAddOpen(true)}>
                Thêm học sinh
              </Button>
            </div>
          </div>

          {notice && (
            <div className="mt-6">
              <Notice type="success">{notice}</Notice>
            </div>
          )}

          <section aria-labelledby="students-heading" className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <h2 id="students-heading" className="border-b border-slate-100 px-6 py-4 font-heading text-lg font-bold text-slate-900">
              Học sinh ({formatNumber(data.students.length)})
            </h2>

            {data.students.length === 0 ? (
              <div className="p-12 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
                  <Users className="size-6" />
                </span>
                <p className="mt-3 font-heading text-lg font-bold text-slate-900">Lớp chưa có học sinh</p>
                <p className="mt-1 text-sm text-slate-500">Chia sẻ mã lớp <strong className="font-mono">{data.code}</strong> hoặc thêm học sinh bằng email.</p>
                <div className="mt-5">
                  <Button leftIcon={<UserPlus />} onClick={() => setAddOpen(true)}>
                    Thêm học sinh
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th scope="col" className="px-6 py-3">Học sinh</th>
                      <th scope="col" className="px-6 py-3">Email</th>
                      <th scope="col" className="px-6 py-3">Ngày tham gia</th>
                      <th scope="col" className="px-6 py-3 text-right">
                        <span className="sr-only">Thao tác</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.students.map((s) => (
                      <tr key={s.id}>
                        <td className="px-6 py-3">
                          <span className="flex items-center gap-3">
                            <UserAvatar name={s.name} />
                            <span className="font-bold text-slate-900">{s.name}</span>
                          </span>
                        </td>
                        <td className="px-6 py-3 text-slate-600">{s.email}</td>
                        <td className="whitespace-nowrap px-6 py-3 text-slate-600">{formatDate(new Date(s.joinedAt))}</td>
                        <td className="px-6 py-3 text-right">
                          <Button variant="ghost" size="sm" leftIcon={<UserMinus />} aria-label={`Xóa ${s.name} khỏi lớp`} onClick={() => setRemoving(s)}>
                            Xóa khỏi lớp
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <AddStudentModal open={addOpen} onClose={() => setAddOpen(false)} classId={data.id} onAdded={(s) => setNotice(`Đã thêm ${s.name} vào lớp.`)} />
          <RemoveStudentModal student={removing} className={data.name} classId={data.id} onClose={() => setRemoving(null)} onRemoved={(s) => setNotice(`Đã xóa ${s.name} khỏi lớp.`)} />
        </>
      )}
    </div>
  );
}
