import { Bell, ChartColumn, ClipboardList, House, Library, PenLine, Sparkles, Users } from "lucide-react";
import AppLayout, { BellLink, UserAvatar } from "./AppLayout";
import type { NavItem } from "./AppLayout";
import Button from "../ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { useTeacherUnread } from "../../features/teacher/useTeacherData";

/** Khung giáo viên: dùng chung AppLayout, chỉ khai báo menu và các phần riêng. */
export default function TeacherLayout() {
  const { user } = useAuth();
  const { data: unread = 0 } = useTeacherUnread();
  const name = user?.name ?? "";

  const items: NavItem[] = [
    { to: "/teacher", label: "Tổng quan", icon: House, end: true },
    { to: "/teacher/classes", label: "Lớp học", icon: Users },
    { to: "/teacher/exercises", label: "Ngân hàng bài tập", icon: Library },
    { to: "/teacher/assignments", label: "Bài đã giao", icon: ClipboardList },
    { to: "/teacher/grading", label: "Chấm bài", icon: PenLine },
    { to: "/teacher/analytics", label: "Phân tích", icon: ChartColumn },
    { to: "/teacher/notifications", label: "Thông báo", icon: Bell, badge: unread },
  ];

  return (
    <AppLayout
      navLabel="Menu giáo viên"
      items={items}
      userName={name}
      userSubtitle="Giáo viên"
      topbar={
        <>
          <span className="text-sm font-bold text-slate-500">Không gian giáo viên</span>
          <BellLink to="/teacher/notifications" ariaLabel={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"} dot={unread > 0} />
          <UserAvatar name={name} />
        </>
      }
      sidebarExtra={
        <div className="rounded-3xl bg-linear-to-br from-brand-light to-violet-50 p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-brand text-white" aria-hidden="true">
            <Sparkles className="size-5" />
          </span>
          <p className="mt-4 font-heading font-bold text-slate-900">Trợ lý soạn bài AI</p>
          <p className="mt-1 text-sm text-slate-500">Tạo bài luyện theo mục tiêu chỉ trong vài phút.</p>
          <div className="-ml-4 mt-2">
            <Button to="/teacher/exercises/new" variant="ghost" size="sm">
              Tạo bài ngay
            </Button>
          </div>
        </div>
      }
    />
  );
}
