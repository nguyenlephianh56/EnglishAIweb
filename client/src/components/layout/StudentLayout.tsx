import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, ChartColumn, ClipboardList, Flame, House, Library, LogOut, Menu, Route, Sparkles } from "lucide-react";
import Button from "../ui/Button";
import Logo from "./Logo";
import { useAuth } from "../../hooks/useAuth";
import { useHomeData } from "../../features/student/useHomeData";

const NAV_ITEMS = [
  { to: "/student", label: "Trang chủ", icon: House, end: true },
  { to: "/student/assigned", label: "Bài được giao", icon: ClipboardList },
  { to: "/student/library", label: "Thư viện luyện tập", icon: Library },
  { to: "/student/profile", label: "Hồ sơ kỹ năng", icon: ChartColumn },
  { to: "/student/path", label: "Lộ trình học", icon: Route },
  { to: "/student/notifications", label: "Thông báo", icon: Bell, badge: true },
];

/** "Minh Anh" -> "MA", "Kiên" -> "KI" */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const { data } = useHomeData();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Esc đóng menu trượt trên màn hình nhỏ
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const name = user?.name ?? "";
  const unread = data?.unreadCount ?? 0;
  const level = data?.skillProfile.level;

  function handleLogout() {
    logout(); // xóa token + dữ liệu phiên
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nền mờ khi menu trượt đang mở (chỉ màn hình nhỏ) */}
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      {/* Sidebar */}
      <aside
        id="student-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white p-5 transition-[transform,visibility] duration-200 lg:visible lg:translate-x-0 ${
          menuOpen ? "visible translate-x-0 shadow-2xl" : "invisible -translate-x-full"
        }`}
      >
        <div className="px-1 pt-1">
          <Logo />
        </div>

        <nav className="mt-8 space-y-1.5" aria-label="Menu học sinh">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                  isActive ? "bg-brand-light font-bold text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {badge && unread > 0 && (
                <span className="grid min-w-6 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white" aria-label={`${unread} chưa đọc`}>
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="rounded-3xl bg-linear-to-br from-brand-light to-violet-50 p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-brand text-white" aria-hidden="true">
              <Sparkles className="size-5" />
            </span>
            <p className="mt-4 font-heading font-bold text-slate-900">Cần trợ giúp?</p>
            <p className="mt-1 text-sm text-slate-500">Trợ giảng AI luôn sẵn sàng giải đáp.</p>
            <span id="chat-soon" className="sr-only">
              Sắp ra mắt
            </span>
            <span title="Sắp ra mắt" className="mt-2 -ml-4 inline-block">
              <Button variant="ghost" size="sm" disabled aria-describedby="chat-soon">
                Trò chuyện ngay
              </Button>
            </span>
          </div>

          <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-indigo-200 to-violet-300 text-sm font-bold text-brand-dark" aria-hidden="true">
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{name}</p>
              <p className="text-xs text-slate-500">Học sinh{level ? ` • ${level}` : ""}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Đăng xuất"
              title="Đăng xuất"
              className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
            >
              <LogOut className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* Nội dung */}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-5 backdrop-blur lg:justify-end lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Mở menu"
              aria-expanded={menuOpen}
              aria-controls="student-sidebar"
              className="grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <span className="hidden sm:block">
              <Logo />
            </span>
          </div>

          <div className="flex items-center gap-3">
            {data && (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700" title="Chuỗi ngày học liên tiếp">
                <Flame className="size-4 text-amber-500" aria-hidden="true" />
                <span>
                  <strong className="font-bold">{data.streak}</strong> ngày
                </span>
              </span>
            )}
            <Link
              to="/student/notifications"
              aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
              className="relative grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
            >
              <Bell className="size-5" aria-hidden="true" />
              {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full border-2 border-white bg-red-500" aria-hidden="true" />}
            </Link>
            <span className="grid size-11 place-items-center rounded-full bg-linear-to-br from-indigo-200 to-violet-300 text-sm font-bold text-brand-dark" aria-hidden="true">
              {initials(name)}
            </span>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
