import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ClipboardList,
  Headphones,
  Mic,
  PenLine,
  Route,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Logo from "../../components/layout/Logo";

const NAV_LINKS = [
  { href: "#ky-nang", label: "Kỹ năng" },
  { href: "#tinh-nang-ai", label: "Tính năng AI" },
  { href: "#cach-hoat-dong", label: "Cách hoạt động" },
  { href: "#giao-vien", label: "Giáo viên" },
];

const SKILLS = [
  { name: "Nghe", icon: Headphones, color: "text-skill-listening", bg: "bg-skill-listening/10", desc: "Nghe đoạn hội thoại, điền từ còn thiếu và chép chính tả." },
  { name: "Nói", icon: Mic, color: "text-skill-speaking", bg: "bg-skill-speaking/10", desc: "Ghi âm câu trả lời, xem từ nào đọc sai hoặc bị thiếu." },
  { name: "Đọc", icon: BookOpen, color: "text-skill-reading", bg: "bg-skill-reading/10", desc: "Đọc đoạn văn, trả lời câu hỏi, đoán nghĩa từ trong ngữ cảnh." },
  { name: "Viết", icon: PenLine, color: "text-skill-writing", bg: "bg-skill-writing/10", desc: "Viết câu, đoạn văn hoặc email và nhận bản sửa chi tiết." },
];

const STEPS = [
  { title: "Chọn bài hoặc nhận bài từ giáo viên", desc: "Vào lớp bằng mã lớp để làm bài được giao, hoặc tự luyện trong thư viện theo kỹ năng và cấp độ." },
  { title: "Làm bài và nhận phản hồi ngay", desc: "Bài trắc nghiệm, điền từ được chấm tức thì. Bài Viết và Nói được AI chấm kèm giải thích bằng tiếng Việt." },
  { title: "Xem tiến bộ và học bài tiếp theo", desc: "Hồ sơ kỹ năng cập nhật sau mỗi bài, từ đó gợi ý bài luyện đúng chỗ bạn còn yếu." },
];

const TEACHER_POINTS = [
  "Tạo lớp và chia sẻ mã lớp cho học sinh",
  "Nhờ AI soạn bản nháp bài tập, bạn chỉnh sửa rồi mới giao",
  "Giao bài kèm hạn nộp và nhắc hạn tự động",
  "Xem bài nộp, sửa điểm và nhận xét của AI",
  "Xem điểm yếu của từng học sinh và cả lớp",
];

// Chiều cao navbar (h-18 = 4.5rem = 72px), dùng để trừ vào vùng quan sát của scroll-spy
const NAV_HEIGHT = 72;
const SPY_IDS = NAV_LINKS.map((l) => l.href.slice(1));

/**
 * Scroll-spy cho navbar: mục nào có section đang nằm ở phần trên của màn hình thì active.
 * Ở hero (đầu trang) không mục nào active. Bấm mục thì active ngay và khóa quan sát
 * cho tới khi cuộn xong để không bị nhấp nháy qua các section ở giữa.
 */
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const visible = useRef(new Set<string>());
  const heroVisible = useRef(true);
  const locked = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const recompute = useCallback(() => {
    if (locked.current) return;
    // Nếu nhiều section cùng nằm trong vùng quan sát, lấy section đứng sau (đang đi vào)
    const current = [...ids].reverse().find((id) => visible.current.has(id));
    if (current) setActive(current);
    else if (heroVisible.current) setActive(null);
    // Không có section nào và cũng không ở hero (ví dụ đang ở footer): giữ mục hiện tại
  }, [ids]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target.id === "hero") heroVisible.current = entry.isIntersecting;
          else if (entry.isIntersecting) visible.current.add(entry.target.id);
          else visible.current.delete(entry.target.id);
        }
        recompute();
      },
      // Vùng quan sát: từ dưới navbar tới khoảng 40% chiều cao màn hình
      { rootMargin: `-${NAV_HEIGHT}px 0px -60% 0px` }
    );
    ["hero", ...ids].forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer.current);
    };
  }, [ids, recompute]);

  const goTo = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, id: string) => {
      const el = document.getElementById(id);
      // Để trình duyệt xử lý mặc định khi mở tab mới (Ctrl/Cmd/Shift + click) hoặc không tìm thấy section
      if (!el || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      locked.current = true;
      setActive(id);
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

      const release = () => {
        window.clearTimeout(timer.current);
        window.removeEventListener("scrollend", release);
        locked.current = false;
        recompute();
      };
      window.addEventListener("scrollend", release, { once: true });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(release, 1500); // dự phòng khi trình duyệt không có scrollend
    },
    [recompute]
  );

  return { active, goTo };
}

function SectionHeading({ id, title, desc }: { id: string; title: string; desc: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-lg text-slate-600">{desc}</p>
    </div>
  );
}

function FeaturePanel({ icon, iconClass, title, desc, children }: { icon: ReactNode; iconClass: string; title: string; desc: string; children: ReactNode }) {
  return (
    <article className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <span className={`grid size-12 place-items-center rounded-2xl ${iconClass}`}>{icon}</span>
      <h3 className="mt-4 font-heading text-xl font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-slate-600">{desc}</p>
      <div className="mt-5 flex-1 rounded-2xl bg-slate-50 p-4 text-sm" aria-hidden="true">
        {children}
      </div>
    </article>
  );
}

function OrbitChip({ icon: Icon, label, color, className }: { icon: typeof Mic; label: string; color: string; className: string }) {
  return (
    <div className={`absolute flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-950/20 ${color} ${className}`}>
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </div>
  );
}

export default function LandingPage() {
  const { active, goTo } = useScrollSpy(SPY_IDS);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Thanh điều hướng */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-5" aria-label="Điều hướng chính">
          <Logo />
          <ul className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => {
              const id = l.href.slice(1);
              const isActive = active === id;
              return (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={(e) => goTo(e, id)}
                    aria-current={isActive ? "location" : undefined}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 motion-reduce:transition-none ${
                      isActive
                        ? "bg-brand text-white shadow-md shadow-brand/30 hover:bg-brand-dark"
                        : "bg-transparent text-slate-600 shadow-none hover:bg-brand-light hover:text-brand"
                    }`}
                  >
                    {l.label}
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-2">
            <Button to="/login" variant="ghost" size="sm">
              Đăng nhập
            </Button>
            <Button to="/register" size="sm">
              Đăng ký
            </Button>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section id="hero" className="overflow-hidden bg-linear-to-br from-brand via-brand-dark to-indigo-800 text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:py-24 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-100">
                <Sparkles className="size-4" aria-hidden="true" />
                Học tập cùng AI
              </p>
              <h1 className="mt-5 font-heading text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                Học tiếng Anh theo đúng <span className="text-teal-300">trình độ của bạn</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg text-indigo-100">
                Lộ trình cá nhân hóa, phản hồi tức thì và tiến bộ rõ ràng mỗi ngày. Luyện đủ bốn kỹ năng Nghe, Nói, Đọc, Viết ở cùng một nơi.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button to="/register" variant="secondary" size="lg" rightIcon={<ArrowRight />}>
                  Tạo tài khoản miễn phí
                </Button>
                <Button to="/login" variant="outline" size="lg">
                  Đăng nhập
                </Button>
              </div>
            </div>

            {/* Quỹ đạo 4 kỹ năng quanh Trợ giảng AI */}
            <div className="relative mx-auto aspect-square w-full max-w-md" aria-hidden="true">
              <div className="absolute inset-4 rounded-full border border-dashed border-white/25" />
              <div className="absolute inset-[16%] rounded-full border border-dashed border-white/20" />
              <div className="absolute inset-[27%] flex flex-col items-center justify-center rounded-full border border-white/25 bg-white/10 p-4 text-center backdrop-blur-sm">
                <span className="grid size-14 place-items-center rounded-full bg-secondary">
                  <Brain className="size-8 text-white" />
                </span>
                <span className="mt-2 font-heading text-lg font-bold leading-tight">Trợ giảng AI</span>
                <span className="mt-0.5 hidden text-xs text-indigo-100 sm:block">Luôn đồng hành cùng bạn</span>
              </div>
              <OrbitChip icon={Headphones} label="Nghe" color="text-skill-listening" className="left-0 top-[14%]" />
              <OrbitChip icon={Mic} label="Nói" color="text-skill-speaking" className="right-[2%] top-[3%]" />
              <OrbitChip icon={BookOpen} label="Đọc" color="text-skill-reading" className="bottom-[8%] left-[6%]" />
              <OrbitChip icon={PenLine} label="Viết" color="text-skill-writing" className="bottom-[14%] right-0" />
            </div>
          </div>
        </section>

        {/* 4 kỹ năng */}
        <section className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 md:py-20" id="ky-nang" aria-labelledby="h-ky-nang">
          <SectionHeading id="h-ky-nang" title="Bốn kỹ năng, mỗi kỹ năng một cách luyện" desc="Bài tập được chia theo kỹ năng và cấp độ A1 đến B2, để bạn luyện đúng phần mình cần." />
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SKILLS.map(({ name, icon: Icon, color, bg, desc }) => (
              <li key={name} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className={`grid size-12 place-items-center rounded-2xl ${bg} ${color}`}>
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-heading text-xl font-bold text-slate-900">{name}</h3>
                <p className="mt-1 text-slate-600">{desc}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Tính năng AI */}
        <section className="scroll-mt-20 bg-white py-16 md:py-20" id="tinh-nang-ai" aria-labelledby="h-ai">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHeading id="h-ai" title="AI chỉ ra lỗi và gợi ý bước tiếp theo" desc="Bạn biết mình sai ở đâu, vì sao sai và nên luyện gì tiếp theo." />
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <FeaturePanel icon={<PenLine className="size-6" />} iconClass="bg-skill-writing/10 text-skill-writing" title="Chấm bài Viết" desc="Điểm theo từng tiêu chí, lỗi được đánh dấu ngay trên bài, kèm giải thích tiếng Việt và bản sửa.">
                <p className="leading-8 text-slate-900">
                  Dear teacher, I am sick. I{" "}
                  <span className="underline decoration-red-500 decoration-wavy underline-offset-4">can not go</span> to school yesterday.
                </p>
                <p className="mt-3 rounded-xl bg-white p-3 text-slate-600">
                  <span className="font-bold text-teal-600">Sửa thành: could not go.</span> Hành động ở quá khứ cần dùng thì quá khứ.
                </p>
              </FeaturePanel>

              <FeaturePanel icon={<Mic className="size-6" />} iconClass="bg-skill-speaking/10 text-skill-speaking" title="Chấm bài Nói" desc="Ghi âm rồi xem kết quả theo từng từ: từ nào đúng, từ nào cần luyện thêm.">
                <p className="flex flex-wrap gap-2 text-base font-semibold">
                  <span className="rounded-lg bg-green-100 px-2.5 py-1 text-green-700">I</span>
                  <span className="rounded-lg bg-green-100 px-2.5 py-1 text-green-700">like</span>
                  <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-amber-700">travelling</span>
                  <span className="rounded-lg bg-green-100 px-2.5 py-1 text-green-700">every</span>
                  <span className="rounded-lg bg-red-100 px-2.5 py-1 text-red-700">summer</span>
                </p>
                <p className="mt-3 text-slate-600">Xanh là đúng, vàng là cần luyện thêm, đỏ là sai hoặc thiếu.</p>
              </FeaturePanel>

              <FeaturePanel icon={<TrendingUp className="size-6" />} iconClass="bg-brand-light text-brand" title="Hồ sơ kỹ năng" desc="Điểm và mức ước lượng cho từng kỹ năng, cùng những loại lỗi bạn hay mắc nhất.">
                {[
                  ["Nghe", "B1", "w-3/5", "bg-skill-listening"],
                  ["Nói", "A2", "w-2/5", "bg-skill-speaking"],
                  ["Đọc", "B1", "w-4/5", "bg-skill-reading"],
                  ["Viết", "A2", "w-1/2", "bg-skill-writing"],
                ].map(([name, level, width, color]) => (
                  <div key={name} className="mb-2.5 flex items-center gap-3 last:mb-0">
                    <span className="w-10 font-semibold text-slate-900">{name}</span>
                    <span className="h-2.5 flex-1 rounded-full bg-slate-200">
                      <span className={`block h-full rounded-full ${width} ${color}`} />
                    </span>
                    <span className="w-7 text-right font-bold text-slate-600">{level}</span>
                  </div>
                ))}
              </FeaturePanel>

              <FeaturePanel icon={<Route className="size-6" />} iconClass="bg-secondary/10 text-teal-600" title="Lộ trình cá nhân" desc="Kế hoạch học theo tuần, dựa trên điểm yếu của bạn, mỗi mục trỏ tới bài cần làm.">
                {[
                  ["Luyện đọc tìm chi tiết (A2)", true],
                  ["Viết email xin nghỉ học", false],
                  ["Nghe điền từ về gia đình", false],
                ].map(([title, done]) => (
                  <div key={String(title)} className="mb-2 flex items-center gap-3 rounded-xl bg-white p-3 last:mb-0">
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full ${done ? "bg-secondary text-white" : "border-2 border-slate-300"}`}>
                      {done && <Check className="size-3.5" />}
                    </span>
                    <span className={done ? "text-slate-400 line-through" : "text-slate-900"}>{title}</span>
                  </div>
                ))}
              </FeaturePanel>
            </div>
            <p className="mt-6 text-sm text-slate-600">Điểm do AI chấm chỉ mang tính tham khảo. Giáo viên có thể xem và sửa điểm, nhận xét của AI.</p>
          </div>
        </section>

        {/* Cách hoạt động */}
        <section className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 md:py-20" id="cach-hoat-dong" aria-labelledby="h-cach">
          <SectionHeading id="h-cach" title="Bắt đầu chỉ với ba bước" desc="Từ lúc đăng ký đến lúc thấy tiến bộ đầu tiên." />
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="grid size-12 place-items-center rounded-2xl bg-brand font-heading text-xl font-extrabold text-white shadow-lg shadow-brand/25">{i + 1}</span>
                <h3 className="mt-4 font-heading text-xl font-bold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-slate-600">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Dành cho giáo viên */}
        <section className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-16 md:pb-24" id="giao-vien" aria-labelledby="h-gv">
          <div className="grid items-center gap-10 rounded-[2rem] bg-brand-light p-8 md:p-12 lg:grid-cols-2">
            <div>
              <h2 id="h-gv" className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                Dành cho giáo viên
              </h2>
              <p className="mt-3 text-lg text-slate-600">Soạn bài nhanh hơn, giao bài đúng hạn và biết ngay học sinh đang yếu ở đâu.</p>
              <ul className="mt-6 space-y-3">
                {TEACHER_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-slate-900">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand text-white">
                      <Check className="size-4" aria-hidden="true" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Button to="/register" size="lg" leftIcon={<Users />}>
                  Đăng ký làm giáo viên
                </Button>
                <p className="mt-3 text-sm text-slate-600">Tài khoản giáo viên được quản trị viên duyệt trước khi sử dụng.</p>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-lg shadow-indigo-900/10" aria-hidden="true">
              <div className="flex items-center justify-between">
                <p className="font-heading text-lg font-bold text-slate-900">Lớp 12A1</p>
                <span className="rounded-lg bg-brand-light px-3 py-1 font-heading text-sm font-bold tracking-widest text-brand">ABC123</span>
              </div>
              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <p className="flex items-center gap-2 font-semibold text-slate-900">
                  <ClipboardList className="size-4 text-brand" />
                  Email xin nghỉ học
                </p>
                <p className="mt-1 text-sm text-slate-600">Hạn nộp 01/11, 09:00</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="h-2.5 flex-1 rounded-full bg-slate-200">
                    <span className="block h-full w-3/4 rounded-full bg-secondary" />
                  </span>
                  <span className="text-sm font-bold text-slate-600">18/24 đã nộp</span>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-400">Ví dụ minh họa</p>
            </div>
          </div>
        </section>
      </main>

      {/* Chân trang */}
      <footer className="bg-slate-900 text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo tone="light" />
            <p className="mt-4 max-w-xs text-sm">Ứng dụng web học kỹ năng tiếng Anh thích ứng, có AI chấm bài Viết và Nói.</p>
          </div>
          <nav aria-label="Khám phá">
            <p className="font-bold text-white">Khám phá</p>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="hover:text-white">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Tài khoản">
            <p className="font-bold text-white">Tài khoản</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to="/login" className="hover:text-white">
                  Đăng nhập
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-white">
                  Đăng ký
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/10 px-5 py-5 text-center text-sm text-slate-400">Đồ án Cơ sở 4, Trường Đại học Công nghệ Thông tin và Truyền thông Việt - Hàn (VKU), 2026</div>
      </footer>
    </div>
  );
}