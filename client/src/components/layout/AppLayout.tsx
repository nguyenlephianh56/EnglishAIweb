import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AvatarMenu from "./AvatarMenu";
import Logo from "./Logo";
import { useAuth } from "../../hooks/useAuth";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Chỉ sáng khi đúng đường dẫn này (dùng cho trang chủ của khu vực) */
  end?: boolean;
  /** Số hiện trong huy hiệu đỏ, ẩn khi 0 hoặc không có */
  badge?: number;
}

interface AppLayoutProps {
  navLabel: string;
  items: NavItem[];
  /** Phần bên phải thanh trên (chip, chuông, avatar...) */
  topbar: ReactNode;
  userName: string;
  userSubtitle: string;
  /** Đường dẫn Trang cá nhân của vai trò này, ví dụ "/student/account" */
  accountPath: string;
  /** Khung phụ đặt phía trên thẻ người dùng cuối sidebar (tùy chọn) */
  sidebarExtra?: ReactNode;
}

/** "Minh Anh" -> "MA", "Kiên" -> "KI" */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function UserAvatar({ name }: { name: string }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-indigo-200 to-violet-300 text-sm font-bold text-brand-dark" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Nút chuông ở thanh trên: là liên kết, chấm đỏ khi có mục mới */
export function BellLink({ to, ariaLabel, dot }: { to: string; ariaLabel: string; dot: boolean }) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className="relative grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
    >
      <Bell className="size-5" aria-hidden="true" />
      {dot && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full border-2 border-white bg-red-500" aria-hidden="true" />}
    </Link>
  );
}

/** Khung chung: sidebar (menu trượt trên màn hình nhỏ) + thanh trên + <Outlet/>. Dùng cho học sinh và quản trị. */
export default function AppLayout({ navLabel, items, topbar, userName, userSubtitle, accountPath, sidebarExtra }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Esc đóng menu trượt trên màn hình nhỏ
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  function handleLogout() {
    logout(); // xóa token + dữ liệu phiên
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nền mờ khi menu trượt đang mở (chỉ màn hình nhỏ) */}
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto border-r border-slate-200 bg-white p-5 transition-[transform,visibility] duration-200 lg:visible lg:translate-x-0 ${
          menuOpen ? "visible translate-x-0 shadow-2xl" : "invisible -translate-x-full"
        }`}
      >
        <div className="px-1 pt-1">
          <Logo />
        </div>

        <nav className="mt-8 space-y-1.5" aria-label={navLabel}>
          {items.map(({ to, label, icon: Icon, end, badge }) => (
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
              {badge !== undefined && badge > 0 && (
                <span className="grid min-w-6 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white" aria-label={`${badge} chưa đọc`}>
                  {badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-4 pt-6">
          {sidebarExtra}

          <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
            <Link
              to={accountPath}
              onClick={() => setMenuOpen(false)}
              aria-label={`Trang cá nhân của ${userName}`}
              className="-m-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1.5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
            >
              <UserAvatar name={userName} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">{userName}</span>
                <span className="block truncate text-xs text-slate-500">{userSubtitle}</span>
              </span>
            </Link>
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

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-5 backdrop-blur lg:justify-end lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Mở menu"
              aria-expanded={menuOpen}
              aria-controls="app-sidebar"
              className="grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <span className="hidden sm:block">
              <Logo />
            </span>
          </div>
          <div className="flex items-center gap-3">
            {topbar}
            <AvatarMenu name={userName} email={user?.email} accountPath={accountPath} onLogout={handleLogout} />
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
