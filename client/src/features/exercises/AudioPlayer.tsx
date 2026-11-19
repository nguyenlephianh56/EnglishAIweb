import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import Button from "../../components/ui/Button";

const RATES = [0.8, 1, 1.25] as const;
type Rate = (typeof RATES)[number];
type Status = "idle" | "playing" | "paused" | "done";

const isSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/**
 * Tách bản đọc thành từng câu: Chrome tự dừng khi đọc một đoạn dài (~15 giây) nên phải phát nối tiếp từng câu.
 * Chỉ ngắt ở dấu .!?… đứng trước khoảng trắng hoặc hết bài, nên "2.5" không bị cắt đôi.
 */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const parts = flat.match(/.+?(?:[.!?…]+["'”’)\]]*(?=\s|$)|$)/g) ?? [];
  return parts.map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/** Ưu tiên en-US, rồi en-GB, rồi giọng bất kỳ có lang bắt đầu bằng "en" */
export function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const lang = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace("_", "-");
  return voices.find((v) => lang(v) === "en-us") ?? voices.find((v) => lang(v) === "en-gb") ?? voices.find((v) => lang(v).startsWith("en"));
}

/** Danh sách giọng nạp chậm: đọc ngay, rồi nghe thêm sự kiện voiceschanged; sau 1,5 giây coi như đã nạp xong. */
function useVoices(enabled: boolean) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const synth = window.speechSynthesis;
    const update = () => setVoices(synth.getVoices());
    update();
    synth.addEventListener?.("voiceschanged", update);
    const t = window.setTimeout(() => setWaited(true), 1500);
    return () => {
      synth.removeEventListener?.("voiceschanged", update);
      window.clearTimeout(t);
    };
  }, [enabled]);
  return { voice: pickEnglishVoice(voices), ready: voices.length > 0 || waited };
}

function AlertBox({ children }: { children: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
      <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}

interface AudioPlayerProps {
  /** Bản đọc đầy đủ. KHÔNG hiển thị chữ này cho học sinh. Thiếu thì hiện cảnh báo và khóa nút phát. */
  spoken?: string;
  className?: string;
}

/**
 * Trình phát bằng speechSynthesis, phát từng câu nối tiếp ("Câu 2/6", không hiện chữ).
 * Chỉ phát khi bấm; luôn cancel trước khi phát và mỗi lượt có một mã nên không bao giờ có hai lượt chồng nhau.
 * Tạm dừng = cancel rồi phát tiếp từ câu hiện tại (pause() không ổn định). Tốc độ áp dụng từ câu kế; đổi giữa chừng thì phát lại câu hiện tại.
 */
export default function AudioPlayer({ spoken, className = "" }: AudioPlayerProps) {
  const [supported] = useState(isSupported);
  const { voice, ready } = useVoices(supported);
  const sentences = useMemo(() => (spoken ? splitSentences(spoken) : []), [spoken]);
  const total = sentences.length;

  const [status, setStatus] = useState<Status>("idle");
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState<Rate>(1);
  const [plays, setPlays] = useState(0);
  const [failed, setFailed] = useState(false);

  const runId = useRef(0); // mỗi lượt phát một mã; callback của lượt cũ bị bỏ qua
  const indexRef = useRef(0);
  const rateRef = useRef<Rate>(1);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  /** Dừng hẳn mọi tiếng đang đọc và vô hiệu hóa callback cũ */
  const halt = useCallback(() => {
    runId.current += 1;
    if (isSupported()) window.speechSynthesis.cancel();
  }, []);

  const speakAt = useCallback(
    function speak(i: number, id: number) {
      const u = new SpeechSynthesisUtterance(sentences[i]);
      const v = voiceRef.current;
      u.lang = v?.lang ?? "en-US";
      if (v) u.voice = v;
      u.rate = rateRef.current;
      u.onend = () => {
        if (id !== runId.current) return;
        if (i + 1 < sentences.length) {
          indexRef.current = i + 1;
          setIndex(i + 1);
          speak(i + 1, id);
        } else {
          setStatus("done");
        }
      };
      u.onerror = (e) => {
        if (id !== runId.current) return;
        if (e.error === "canceled" || e.error === "interrupted") return;
        setFailed(true);
        setStatus("paused");
      };
      window.speechSynthesis.speak(u);
    },
    [sentences]
  );

  const startFrom = useCallback(
    (i: number, countListen: boolean) => {
      if (!isSupported() || sentences.length === 0) return;
      halt(); // cancel trước khi phát
      const id = runId.current;
      indexRef.current = i;
      setIndex(i);
      setStatus("playing");
      setFailed(false);
      if (countListen) setPlays((p) => p + 1);
      speakAt(i, id);
    },
    [halt, sentences.length, speakAt]
  );

  const pause = useCallback(() => {
    halt();
    setStatus((s) => (s === "playing" ? "paused" : s));
  }, [halt]);

  // Rời trang, ẩn tab hoặc gỡ component thì dừng đọc
  useEffect(() => {
    const onHide = () => pause();
    const onVisibility = () => document.visibilityState === "hidden" && pause();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      halt();
    };
  }, [pause, halt]);

  // Đổi bản đọc (đổi bài) thì về đầu
  useEffect(() => {
    halt();
    indexRef.current = 0;
    setIndex(0);
    setStatus("idle");
  }, [spoken, halt]);

  function onPrimary() {
    if (status === "playing") pause();
    else if (status === "paused") startFrom(indexRef.current, false);
    else startFrom(0, true);
  }

  function changeRate(next: Rate) {
    setRate(next);
    rateRef.current = next;
    if (status === "playing") startFrom(indexRef.current, false); // phát lại câu hiện tại với tốc độ mới
  }

  if (!supported) {
    return (
      <div className={className}>
        <AlertBox>Trình duyệt này không hỗ trợ đọc bằng giọng nói (speechSynthesis), nên chưa nghe được bài. Hãy mở bằng Chrome, Edge hoặc Safari bản mới.</AlertBox>
      </div>
    );
  }

  const hasSpoken = total > 0;
  const noVoice = ready && !voice;
  const loadingVoice = !ready;
  const disabled = !hasSpoken || noVoice || loadingVoice;
  const done = status === "done";
  const percent = status === "idle" ? 0 : done ? 100 : Math.round(((index + 1) / Math.max(1, total)) * 100);
  const current = Math.min(index + 1, Math.max(total, 1));
  const statusText = !hasSpoken ? "Chưa có lời đọc." : loadingVoice ? "Đang tải giọng đọc..." : status === "playing" ? "Đang phát..." : status === "paused" ? "Đã tạm dừng." : done ? "Đã phát xong. Có thể nghe lại." : "Bấm Phát để bắt đầu.";

  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${className}`}>
      {!hasSpoken && (
        <div className="mb-3">
          <AlertBox>Bài nghe này chưa có lời đọc đầy đủ nên chưa phát được (cần cập nhật từ máy chủ)</AlertBox>
        </div>
      )}
      {hasSpoken && noVoice && (
        <div className="mb-3">
          <AlertBox>Thiết bị này chưa có giọng đọc tiếng Anh. Hãy cài giọng tiếng Anh trong cài đặt hệ điều hành hoặc mở bằng Chrome, Edge, Safari bản mới.</AlertBox>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-light text-brand" aria-hidden="true">
          <Volume2 className="size-5" />
        </span>
        <div className="mr-auto min-w-0">
          <p className="text-sm font-bold text-slate-900">
            Bài nghe{hasSpoken && <span className="ml-2 font-semibold text-slate-500">Câu {current}/{total}</span>}
          </p>
          <p className="text-xs text-slate-500" role="status" aria-live="polite">
            {statusText} {plays > 0 && `Đã nghe ${plays} lần.`}
          </p>
        </div>

        <Button type="button" size="sm" disabled={disabled} leftIcon={status === "playing" ? <Pause /> : <Play />} onClick={onPrimary}>
          {status === "playing" ? "Tạm dừng" : status === "paused" ? "Phát tiếp" : "Phát"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || status === "idle"} leftIcon={<RotateCcw />} onClick={() => startFrom(0, true)}>
          Nghe lại từ đầu
        </Button>
      </div>

      {hasSpoken && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Tiến độ bài nghe" aria-valuemin={0} aria-valuemax={total} aria-valuenow={status === "idle" ? 0 : done ? total : index + 1}>
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      )}

      <div role="group" aria-label="Tốc độ đọc" className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500">Tốc độ</span>
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={rate === r}
            disabled={disabled}
            onClick={() => changeRate(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-50 ${
              rate === r ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {r}x
          </button>
        ))}
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-xs font-semibold text-red-600">
          Không phát được âm thanh. Hãy thử bấm Phát lại hoặc đổi trình duyệt.
        </p>
      )}
    </div>
  );
}
