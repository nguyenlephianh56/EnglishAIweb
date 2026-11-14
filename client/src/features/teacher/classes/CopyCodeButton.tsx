import { useEffect, useRef, useState } from "react";

type Status = "idle" | "copied" | "failed";

/** Ghi chữ vào clipboard; trình duyệt chặn Clipboard API (http, iframe...) thì thử cách cũ. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Nút "Sao chép" mã lớp: đổi thành "Đã sao chép" trong 2 giây. */
export default function CopyCodeButton({ code, className = "" }: { code: string; className?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const ok = await writeClipboard(code);
    setStatus(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Sao chép mã lớp ${code}`}
        className={`rounded-md text-xs font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
          status === "copied" ? "text-green-600" : status === "failed" ? "text-red-600" : "text-brand hover:text-brand-dark"
        } ${className}`}
      >
        {status === "copied" ? "Đã sao chép" : status === "failed" ? "Không sao chép được" : "Sao chép"}
      </button>
      <span className="sr-only" role="status">
        {status === "copied" ? "Đã sao chép mã lớp" : status === "failed" ? "Không sao chép được mã lớp" : ""}
      </span>
    </>
  );
}
