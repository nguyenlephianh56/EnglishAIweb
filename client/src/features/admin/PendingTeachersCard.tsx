import { ArrowRight, ClipboardCheck } from "lucide-react";
import Button from "../../components/ui/Button";
import { initials } from "../../components/layout/AppLayout";
import { formatRegisteredAt } from "../../utils/format";
import type { AdminUser } from "../../types/admin";

interface PendingTeachersCardProps {
  teachers: AdminUser[];
  loading: boolean;
  /** id giáo viên đang được duyệt (hiện loading ở đúng dòng đó) */
  approvingId: number | null;
  onApprove: (teacher: AdminUser) => void;
}

const MAX_ROWS = 5;
const TH = "px-4 py-3 text-xs font-bold tracking-wider text-slate-500";

export default function PendingTeachersCard({ teachers, loading, approvingId, onApprove }: PendingTeachersCardProps) {
  const rows = teachers.slice(0, MAX_ROWS);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-pending">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="h-pending" className="font-heading text-xl font-bold text-slate-900">
            Giáo viên chờ duyệt
          </h2>
          <p className="mt-1 text-sm text-slate-500">{loading ? "Đang tải danh sách..." : `${teachers.length} yêu cầu đăng ký mới cần xử lý`}</p>
        </div>
        <Button to="/admin/users?status=PENDING" variant="ghost" size="sm" rightIcon={<ArrowRight />}>
          Xem tất cả
        </Button>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3" role="status" aria-label="Đang tải">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <ClipboardCheck className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Không có yêu cầu nào</p>
          <p className="mt-1 text-sm text-slate-500">Giáo viên đăng ký mới sẽ hiện ở đây để bạn duyệt.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={`${TH} rounded-l-xl`}>GIÁO VIÊN</th>
                <th scope="col" className={TH}>TRƯỜNG / ĐƠN VỊ</th>
                <th scope="col" className={TH}>CHUYÊN MÔN</th>
                <th scope="col" className={TH}>NGÀY ĐĂNG KÝ</th>
                <th scope="col" className={TH}>MINH CHỨNG</th>
                <th scope="col" className={`${TH} rounded-r-xl`}>THAO TÁC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary/15 text-xs font-bold text-teal-700" aria-hidden="true">
                        {initials(t.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{t.name}</p>
                        <p className="truncate text-xs text-slate-500">{t.email}</p>
                      </div>
                    </div>
                  </td>
                  {/* TODO: backend chưa có trường đơn vị, chuyên môn, minh chứng cho giáo viên */}
                  <td className="px-4 py-4 text-slate-500">—</td>
                  <td className="px-4 py-4 text-slate-500">—</td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-700">{formatRegisteredAt(t.createdAt)}</td>
                  <td className="px-4 py-4">
                    <Button variant="ghost" size="sm" disabled className="-ml-4">
                      Xem hồ sơ
                    </Button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      {/* TODO: chưa có API từ chối giáo viên */}
                      <span title="Sắp ra mắt">
                        <Button variant="danger" size="sm" disabled>
                          Từ chối
                        </Button>
                      </span>
                      <Button variant="secondary" size="sm" loading={approvingId === t.id} disabled={approvingId !== null && approvingId !== t.id} onClick={() => onApprove(t)}>
                        Duyệt
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
