import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useAuth } from "../../hooks/useAuth";
import ProfileHeaderCard from "./ProfileHeaderCard";
import InfoTab from "./InfoTab";
import SecurityTab from "./SecurityTab";
import RoleSection from "./RoleSection";

const TABS = [
  { id: "info", label: "Thông tin" },
  { id: "security", label: "Bảo mật" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Trang cá nhân dùng chung cho học sinh, giáo viên và quản trị (gắn vào /<vai trò>/account). */
export default function AccountPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>("info");
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ info: null, security: null });

  if (!user) return null; // RequireRole đã đảm bảo có người dùng

  // Điều hướng tab bằng bàn phím: ← → Home End
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Trang cá nhân</h1>
      <p className="mt-2 text-slate-500">Quản lý thông tin tài khoản và bảo mật của bạn.</p>

      <div className="mt-8 space-y-6">
        <ProfileHeaderCard user={user} />

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div role="tablist" aria-label="Thiết lập tài khoản" className="flex rounded-2xl bg-slate-100 p-1.5">
            {TABS.map((t) => {
              const selected = t.id === tab;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`account-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls={`account-panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={onTabKeyDown}
                  className={`flex-1 rounded-xl py-3 text-center text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                    selected ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="mt-6" role="tabpanel" id={`account-panel-${tab}`} aria-labelledby={`account-tab-${tab}`}>
            {tab === "info" ? <InfoTab user={user} /> : <SecurityTab />}
          </div>
        </section>

        <RoleSection role={user.role} />
      </div>
    </div>
  );
}
