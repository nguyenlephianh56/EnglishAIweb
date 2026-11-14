import { BookOpen, Brain, Check, ChartColumn, House, Library, Target, Users } from "lucide-react";
import AppLayout, { BellLink } from "./AppLayout";
import type { NavItem } from "./AppLayout";
import { useAuth } from "../../hooks/useAuth";
import { usePendingTeachers } from "../../features/admin/useAdminData";

const ITEMS: NavItem[] = [
  { to: "/admin", label: "Tổng quan", icon: House, end: true },
  { to: "/admin/users", label: "Tài khoản", icon: Users },
  { to: "/admin/library", label: "Thư viện bài tập", icon: Library },
  { to: "/admin/proposals", label: "Duyệt đề xuất", icon: Check },
  { to: "/admin/reports", label: "Báo lỗi", icon: Target },
  { to: "/admin/ai-config", label: "Cấu hình AI", icon: Brain },
  { to: "/admin/stats", label: "Thống kê", icon: ChartColumn },
  { to: "/admin/logs", label: "Nhật ký", icon: BookOpen },
];

/** Khung quản trị: dùng chung AppLayout với học sinh, không có khung "Cần trợ giúp?". */
export default function AdminLayout() {
  const { user } = useAuth();
  const { data: pending } = usePendingTeachers();
  const pendingCount = pending?.length ?? 0;
  const name = user?.name ?? "";

  return (
    <AppLayout
      navLabel="Menu quản trị"
      items={ITEMS}
      userName={name}
      accountPath="/admin/account"
      userSubtitle="Quản trị hệ thống"
      topbar={
        <>
          <span className="text-sm font-bold text-slate-500">Trung tâm quản trị</span>
          {/* Chuông dẫn tới giáo viên đang chờ duyệt; chấm đỏ khi còn yêu cầu */}
          <BellLink
            to="/admin/users?status=PENDING"
            ariaLabel={pendingCount > 0 ? `${pendingCount} giáo viên chờ duyệt` : "Giáo viên chờ duyệt"}
            dot={pendingCount > 0}
          />
        </>
      }
    />
  );
}
