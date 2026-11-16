import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, Play, RotateCcw, Square, Volume2 } from "lucide-react";
import Button from "../../components/ui/Button";

const RATES = [0.8, 1, 1.25] as const;
const LANG = "en-US";

interface AudioPlayerProps {
  /** Văn bản được đọc lên. KHÔNG hiển thị chữ này cho học sinh. */
  script: string;
  className?: string;
}

const isSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Tách theo câu: Chrome hay cắt giữa chừng khi đọc một đoạn dài liền một mạch. */
const splitSentences = (script: string) => (script.match(/[^.!?\n]+[.!?]*/g) ?? [script]).map((s) => s.trim()).filter(Boolean);

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === LANG) ?? voices.find((v) => v.lang.toLowerCase().startsWith("en"));
}

/** Trình phát âm thanh dùng speechSynthesis (giọng en-US): Nghe / Nghe lại / Dừng, tốc độ 0.8x, 1x, 1.25x. Dừng đọc khi rời trang. */
export default function AudioPlayer({ script, className }: AudioPlayerProps) {
  const [supported] = useState(isSupported);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const [failed, setFailed] = useState(false);
  // Mỗi lần phát có một mã; callback của lần phát cũ (đã bị dừng/hủy) bị bỏ qua
  const runId = useRef(0);

  const stop = useCallback(() => {
    runId.current += 1;
    if (isSupported()) window.speechSynthesis.cancel();
    setPlaying(false);
  }, []);

  const play = useCallback(
    (speed: number) => {
      if (!isSupported()) return;
      window.speechSynthesis.cancel();
      const id = ++runId.current;
      const sentences = splitSentences(script);
      if (sentences.length === 0) return;
      const voice = pickVoice();
      setFailed(false);
      setPlaying(true);
      setPlayed(true);
      sentences.forEach((text, i) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = LANG;
        u.rate = speed;
        if (voice) u.voice = voice;
        if (i === sentences.length - 1) u.onend = () => id === runId.current && setPlaying(false);
        u.onerror = (e) => {
          if (id !== runId.current) return;
          if (e.error !== "canceled" && e.error !== "interrupted") setFailed(true);
          setPlaying(false);
        };
        window.speechSynthesis.speak(u);
      });
    },
    [script]
  );

  // Rời trang (hoặc đổi bài) thì ngừng đọc
  useEffect(() => {
    const onHide = () => stop();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      runId.current += 1;
      if (isSupported()) window.speechSynthesis.cancel();
    };
  }, [stop]);

  // Danh sách giọng nạp chậm ở một số trình duyệt: không cần làm gì, pickVoice đọc lại mỗi lần phát
  function changeRate(next: (typeof RATES)[number]) {
    setRate(next);
    if (playing) play(next);
  }

  if (!supported) {
    return (
      <div role="alert" className={`flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 ${className ?? ""}`}>
        <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        Trình duyệt này không hỗ trợ đọc bằng giọng nói (speechSynthesis), nên chưa nghe được bài. Hãy mở bằng Chrome, Edge hoặc Safari bản mới.
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-light text-brand" aria-hidden="true">
          <Volume2 className="size-5" />
        </span>
        <div className="mr-auto min-w-0">
          <p className="text-sm font-bold text-slate-900">Bài nghe</p>
          <p className="text-xs text-slate-500" role="status" aria-live="polite">
            {playing ? "Đang phát..." : played ? "Đã phát xong. Có thể nghe lại." : "Bấm Nghe để bắt đầu."}
          </p>
        </div>

        {playing ? (
          <Button type="button" variant="outline" size="sm" leftIcon={<Square />} onClick={stop}>
            Dừng
          </Button>
        ) : (
          <Button type="button" size="sm" leftIcon={played ? <RotateCcw /> : <Play />} onClick={() => play(rate)}>
            {played ? "Nghe lại" : "Nghe"}
          </Button>
        )}
      </div>

      <div role="group" aria-label="Tốc độ đọc" className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500">Tốc độ</span>
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={rate === r}
            onClick={() => changeRate(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
              rate === r ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {r}x
          </button>
        ))}
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-xs font-semibold text-red-600">
          Không phát được âm thanh. Hãy thử bấm Nghe lại hoặc đổi trình duyệt.
        </p>
      )}
    </div>
  );
}
