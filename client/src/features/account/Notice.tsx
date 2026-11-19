import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";

const STYLE = {
  success: { cls: "border-green-200 bg-green-50 text-green-700", Icon: CircleCheck, role: "status" },
  error: { cls: "border-red-200 bg-red-50 text-red-700", Icon: CircleAlert, role: "alert" },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-800", Icon: TriangleAlert, role: "status" },
} as const;

/** Thông báo ngắn: xanh khi thành công, vàng khi cảnh báo (role=status), đỏ khi lỗi (role=alert) */
export default function Notice({ type, children }: { type: "success" | "error" | "warning"; children: string }) {
  const { cls, Icon, role } = STYLE[type];
  return (
    <div role={role} className={`flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold ${cls}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}
