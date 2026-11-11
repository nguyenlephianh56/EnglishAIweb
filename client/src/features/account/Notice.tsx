import { CircleAlert, CircleCheck } from "lucide-react";

/** Thông báo ngắn: xanh khi thành công (role=status), đỏ khi lỗi (role=alert) */
export default function Notice({ type, children }: { type: "success" | "error"; children: string }) {
  const ok = type === "success";
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold ${ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}
