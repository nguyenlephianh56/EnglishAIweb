import type { ReactNode } from "react";
import Button from "../ui/Button";
import Logo from "./Logo";
import { useAuth } from "../../hooks/useAuth";

interface PlaceholderPageProps {
  title: string;
  description: string;
  children?: ReactNode;
}

/** Trang tạm cho các màn chưa làm. Có nút Đăng xuất khi đang đăng nhập để dễ thử chuyển hướng. */
export default function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  const { user, logout } = useAuth();
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60">
        <Logo />
        <h1 className="mt-8 font-heading text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">{description}</p>
        {user && <p className="mt-4 text-sm font-semibold text-slate-900">Đang đăng nhập: {user.name}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          {children}
          {user && (
            <Button variant="outline" onClick={logout}>
              Đăng xuất
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}