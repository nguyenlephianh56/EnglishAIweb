import { Bell, ChartNoAxesColumn, ClipboardList, Home, Library, Route, Sparkles } from "lucide-react";
import AppLayout from "./AppLayout";
import type { NavItem } from "./AppLayout";
import Button from "../ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { useSkillProfile } from "../../features/student/useSkillProfile";
import NotificationBell from "../../features/student/NotificationBell";
import { useNotifications } from "../../features/student/useNotifications";

/** Khung học sinh: chỉ khai báo menu và các phần riêng, phần còn lại do AppLayout lo. */
export default function StudentLayout() {
  const { user } = useAuth();
  const { data: profile } = useSkillProfile("30d"); // dùng chung cache với Trang chủ và Hồ sơ kỹ năng
  const name = user?.name ?? "";
  const { unread } = useNotifications(); // dùng chung với chuông và trang Thông báo
  const level = profile?.hasData ? profile.level : undefined; // chưa có dữ liệu thì chỉ hiện "Học sinh"

  const items: NavItem[] = [
    { to: "/student", label: "Trang chủ", icon: Home, end: true },
    { to: "/student/assigned", label: "Bài được giao", icon: ClipboardList },
    { to: "/student/library", label: "Thư viện luyện tập", icon: Library },
    { to: "/student/profile", label: "Hồ sơ kỹ năng", icon: ChartNoAxesColumn },
    { to: "/student/path", label: "Lộ trình học", icon: Route },
    { to: "/student/notifications", label: "Thông báo", icon: Bell, badge: unread },
  ];

  return (
    <AppLayout
      navLabel="Menu học sinh"
      items={items}
      userName={name}
      accountPath="/student/account"
      userSubtitle={`Học sinh${level ? ` • ${level}` : ""}`}
      topbar={<NotificationBell />}
      sidebarExtra={
        <div className="rounded-3xl bg-linear-to-br from-brand-light to-violet-50 p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-brand text-white" aria-hidden="true">
            <Sparkles className="size-5" />
          </span>
          <p className="mt-4 font-heading font-bold text-slate-900">Cần trợ giúp?</p>
          <p className="mt-1 text-sm text-slate-500">Trợ giảng AI luôn sẵn sàng giải đáp.</p>
          <span id="chat-soon" className="sr-only">
            Sắp ra mắt
          </span>
          <span title="Sắp ra mắt" className="-ml-4 mt-2 inline-block">
            <Button variant="ghost" size="sm" disabled aria-describedby="chat-soon">
              Trò chuyện ngay
            </Button>
          </span>
        </div>
      }
    />
  );
}
