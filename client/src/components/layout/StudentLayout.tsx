import { Bell, ChartNoAxesColumn, ClipboardList, Flame, Home, Library, Route, Sparkles } from "lucide-react";
import AppLayout, { BellLink } from "./AppLayout";
import type { NavItem } from "./AppLayout";
import Button from "../ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { useHomeData } from "../../features/student/useHomeData";

/** Khung học sinh: chỉ khai báo menu và các phần riêng, phần còn lại do AppLayout lo. */
export default function StudentLayout() {
  const { user } = useAuth();
  const { data } = useHomeData();
  const name = user?.name ?? "";
  const unread = data?.unreadCount ?? 0;
  const level = data?.skillProfile.level;

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
      topbar={
        <>
          {data && (
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700" title="Chuỗi ngày học liên tiếp">
              <Flame className="size-4 text-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-bold">{data.streak}</strong> ngày
              </span>
            </span>
          )}
          <BellLink to="/student/notifications" ariaLabel={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"} dot={unread > 0} />
        </>
      }
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
