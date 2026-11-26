import { Bell, ChartNoAxesColumn, ClipboardList, History, Home, Library, Route } from "lucide-react";
import AppLayout from "./AppLayout";
import type { NavItem } from "./AppLayout";
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
    { to: "/student/history", label: "Lịch sử làm bài", icon: History },
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
    />
  );
}