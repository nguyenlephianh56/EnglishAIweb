import { Loader2 } from "lucide-react";

export default function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50" role="status" aria-label="Đang tải">
      <Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />
    </div>
  );
}
