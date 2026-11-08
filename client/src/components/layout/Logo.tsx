import { Link } from "react-router-dom";

interface LogoProps {
  /** "light" dùng trên nền tối/indigo, "default" dùng trên nền sáng */
  tone?: "default" | "light";
}

export default function Logo({ tone = "default" }: LogoProps) {
  const light = tone === "light";
  return (
    <Link to="/" className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30" aria-label="EnglishAI, về trang chủ">
      <span
        className={`flex size-11 flex-col items-center justify-center rounded-xl font-heading text-sm font-extrabold leading-none ${
          light ? "bg-white text-brand" : "bg-brand text-white"
        }`}
        aria-hidden="true"
      >
        E
        <span className={light ? "text-secondary" : "text-teal-300"}>A</span>
      </span>
      <span className={`font-heading text-2xl font-extrabold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
        English<span className="text-secondary">AI</span>
      </span>
    </Link>
  );
}
