import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import Button from "../../../components/ui/Button";
import Notice from "../../account/Notice";
import { generatedAtLabel } from "./analysisMeta";

interface Props {
  /** ISO của kết quả đang hiển thị; undefined = chưa có kết quả */
  generatedAt?: string;
  running: boolean;
  /** Có phân tích khác đang chạy */
  busy: boolean;
  errorMessage?: string;
  onRun: () => void;
  /** Nhãn nút khi chưa có kết quả, ví dụ "Phân tích lớp bằng AI" */
  startLabel: string;
}

/** Nút chạy phân tích + trạng thái: chờ AI, lỗi (giữ kết quả cũ), thời điểm phân tích gần nhất, "Phân tích lại". */
export default function AnalysisToolbar({ generatedAt, running, busy, errorMessage, onRun, startLabel }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {generatedAt ? <p className="text-sm font-semibold text-slate-500">{generatedAtLabel(generatedAt)}</p> : <span />}
        {generatedAt ? (
          <Button variant="outline" size="sm" leftIcon={running ? <Loader2 className="animate-spin" /> : <RefreshCw />} disabled={busy} onClick={onRun}>
            {running ? "AI đang phân tích…" : "Phân tích lại"}
          </Button>
        ) : (
          <Button leftIcon={running ? <Loader2 className="animate-spin" /> : <Sparkles />} disabled={busy} onClick={onRun}>
            {running ? "AI đang phân tích…" : startLabel}
          </Button>
        )}
      </div>
      {running && (
        <p role="status" className="text-sm font-semibold text-violet-700">
          AI đang phân tích, có thể mất 10–30 giây…
        </p>
      )}
      {errorMessage && <Notice type="error">{errorMessage}</Notice>}
    </div>
  );
}
