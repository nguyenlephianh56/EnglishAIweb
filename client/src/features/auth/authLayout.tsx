import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, Brain, Headphones, Mic, PenLine, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import Logo from "../../components/layout/Logo";

interface AuthLayoutProps {
  mode: "login" | "register";
  title: string;
  subtitle: string;
  children: ReactNode;
}

const TABS = [
  { mode: "login", to: "/login", label: "Đăng nhập" },
  { mode: "register", to: "/register", label: "Đăng ký" },
] as const;

function OrbitChip({ icon: Icon, label, color, className }: { icon: typeof Mic; label: string; color: string; className: string }) {
  return (
    <div className={`absolute flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-950/20 ${color} ${className}`}>
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </div>
  );
}

export default function AuthLayout({ mode, title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      {/* Trái: giới thiệu (ẩn dưới lg) */}
      <aside className="relative hidden flex-col overflow-hidden bg-linear-to-br from-brand via-brand-dark to-indigo-800 p-12 text-white lg:flex">
        <Logo tone="light" />
        <div className="my-auto py-10">
          <p className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-indigo-100">
            <Sparkles className="size-4" aria-hidden="true" />
            HỌC TẬP THÔNG MINH CÙNG AI
          </p>
          <h2 className="mt-5 max-w-lg font-heading text-5xl font-extrabold leading-[1.1] tracking-tight xl:text-6xl">
            Học tiếng Anh theo đúng <span className="text-teal-300">trình độ của bạn</span>
          </h2>
          <p className="mt-4 max-w-md text-lg text-indigo-100">Lộ trình cá nhân hóa, phản hồi tức thì và tiến bộ rõ ràng mỗi ngày.</p>

          <div className="relative mx-auto mt-10 aspect-[4/3] w-full max-w-md" aria-hidden="true">
            <div className="absolute inset-x-[4%] inset-y-[8%] rounded-full border border-dashed border-white/25" />
            <div className="absolute inset-x-[16%] inset-y-[20%] rounded-full border border-dashed border-white/20" />
            <div className="absolute left-1/2 top-1/2 flex size-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-white/25 bg-white/10 text-center backdrop-blur-sm">
              <span className="grid size-12 place-items-center rounded-full bg-secondary">
                <Brain className="size-7 text-white" />
              </span>
              <span className="mt-1.5 font-heading text-sm font-bold leading-tight">Trợ giảng AI</span>
              <span className="text-[10px] text-indigo-100">Luôn đồng hành cùng bạn</span>
            </div>
            <OrbitChip icon={Headphones} label="Nghe" color="text-skill-listening" className="left-[2%] top-[10%]" />
            <OrbitChip icon={Mic} label="Nói" color="text-skill-speaking" className="right-[12%] top-[0%]" />
            <OrbitChip icon={BookOpen} label="Đọc" color="text-skill-reading" className="bottom-[2%] left-[10%]" />
            <OrbitChip icon={PenLine} label="Viết" color="text-skill-writing" className="bottom-[8%] right-[4%]" />
          </div>
        </div>
      </aside>

      {/* Phải: tab + form */}
      <main className="flex flex-col px-6 py-6 sm:px-12 lg:px-16">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto">
            <Button to="/" variant="ghost" size="sm" leftIcon={<ArrowLeft />}>
              Về trang chủ
            </Button>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <nav className="flex rounded-2xl bg-slate-100 p-1.5" aria-label="Chuyển giữa đăng nhập và đăng ký">
            {TABS.map((tab) => {
              const current = tab.mode === mode;
              return (
                <Link
                  key={tab.mode}
                  to={tab.to}
                  aria-current={current ? "page" : undefined}
                  className={`flex-1 rounded-xl py-3 text-center text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                    current ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <h1 className="mt-8 font-heading text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-slate-600">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}