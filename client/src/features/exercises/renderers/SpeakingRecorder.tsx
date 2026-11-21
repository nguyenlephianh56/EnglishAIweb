import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, Info, Mic, RotateCcw, Square } from "lucide-react";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { BrokenContent } from "./ReviewParts";
import type { ExerciseRendererProps } from "../rendererTypes";
import type { SpeakingValue } from "../../../types/exercise";

/** Bản ghi ngắn hơn mức này không được nộp */
export const MIN_SPEAKING_SECONDS = 3;
/** Tự dừng khi đạt mức này */
export const MAX_SPEAKING_SECONDS = 120;
/** Backend nhận tối đa 10 MB */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const EMPTY: SpeakingValue = { blob: null, durationSec: 0 };
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

/** Định dạng ghi âm dùng được (backend chỉ nhận webm), hoặc null nếu trình duyệt không hỗ trợ (Safari/iOS...) */
function pickMimeType(): string | null {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return null;
}

function micErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Trình duyệt đang chặn micro. Hãy cấp quyền micro cho trang này (biểu tượng ổ khóa cạnh địa chỉ web) rồi thử lại.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Không tìm thấy micro. Hãy cắm micro hoặc kiểm tra thiết bị âm thanh rồi thử lại.";
  if (name === "NotReadableError") return "Không mở được micro, có thể một ứng dụng khác đang dùng. Hãy đóng ứng dụng đó rồi thử lại.";
  return "Không bật được micro. Vui lòng thử lại.";
}

/**
 * Bài Nói: chỉ hiện đề (prompt, KHÔNG hiện câu mẫu) và bộ ghi âm. Trạng thái: chưa ghi -> đang ghi -> đã ghi.
 * Bản ghi nằm trong value ({ blob, durationSec }) trên máy, chỉ tải lên khi nộp bài (ExerciseRunner).
 * Dừng micro khi dừng ghi, khi rời trang và khi component bị gỡ.
 */
export default function SpeakingRecorder({ content, value, onChange, mode, disabled }: ExerciseRendererProps<"speaking">) {
  const review = mode === "review";
  const [mimeType] = useState(pickMimeType);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const limitRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const releaseMic = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Rời trang/gỡ component: dừng ghi, tắt micro, không gửi thêm thay đổi nào
  useEffect(
    () => () => {
      const rec = recorderRef.current;
      if (rec) {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.onerror = null;
        if (rec.state !== "inactive") {
          try {
            rec.stop();
          } catch {
            /* đã dừng */
          }
        }
      }
      recorderRef.current = null;
      releaseMic();
    },
    [releaseMic],
  );

  // Đường dẫn tạm để nghe lại; thu hồi khi đổi bản ghi hoặc gỡ component
  const blob = value?.blob ?? null;
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (typeof content?.prompt !== "string") return <BrokenContent />;
  const durationSec = value?.durationSec ?? 0;
  const recorded = blob !== null;
  const tooShort = recorded && durationSec < MIN_SPEAKING_SECONDS;

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  async function start() {
    if (!mimeType || recording || disabled) return;
    setError(null);
    setNotice(null);
    limitRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(micErrorMessage(e));
      return;
    }

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Không bắt đầu ghi âm được. Hãy thử lại hoặc dùng Chrome, Edge, Firefox.");
      return;
    }
    streamRef.current = stream;
    recorderRef.current = rec;
    chunksRef.current = [];

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onerror = () => {
      releaseMic();
      setRecording(false);
      setError("Việc ghi âm bị gián đoạn. Hãy ghi lại.");
      onChangeRef.current(EMPTY);
    };
    rec.onstop = () => {
      const seconds = Math.min(MAX_SPEAKING_SECONDS, Math.round((Date.now() - startedAtRef.current) / 1000));
      releaseMic();
      setRecording(false);
      setElapsed(seconds);
      const out = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];
      if (out.size === 0) {
        setError("Không ghi được âm thanh. Hãy kiểm tra micro rồi ghi lại.");
        onChangeRef.current(EMPTY);
        return;
      }
      if (out.size > MAX_AUDIO_BYTES) {
        setError("Bản ghi quá lớn (tối đa 10 MB). Hãy ghi ngắn hơn.");
        onChangeRef.current(EMPTY);
        return;
      }
      if (limitRef.current) setNotice("Đã đạt tối đa 2 phút nên bản ghi tự dừng.");
      onChangeRef.current({ blob: out, durationSec: seconds });
    };

    onChange(EMPTY); // bắt đầu ghi mới: bản cũ (nếu còn) bị bỏ
    startedAtRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
    rec.start();
    timerRef.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(Math.min(s, MAX_SPEAKING_SECONDS));
      if (s >= MAX_SPEAKING_SECONDS) {
        limitRef.current = true;
        stop();
      }
    }, 250);
  }

  function discard() {
    setConfirmOpen(false);
    setNotice(null);
    setError(null);
    setElapsed(0);
    onChange(EMPTY);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Đề bài</p>
        <p className="whitespace-pre-line text-[15px] leading-7 text-slate-800">{content.prompt}</p>
        <p className="mt-3 text-sm font-semibold text-slate-500">Hãy nói ít nhất vài câu, tối đa 2 phút.</p>
      </div>

      {review ? null : !mimeType ? (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          Trình duyệt của em chưa hỗ trợ ghi âm cho bài này (thường gặp trên Safari hoặc iPhone). Hãy mở bằng Chrome, Edge hoặc Firefox để làm bài Nói.
        </div>
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6" aria-label="Ghi âm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`relative grid size-12 place-items-center rounded-full ${recording ? "bg-red-50 text-red-600" : recorded ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`} aria-hidden="true">
                {recording && <span className="absolute inset-0 animate-ping rounded-full bg-red-200/60 motion-reduce:hidden" />}
                <Mic className="relative size-6" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">{recording ? "Đang ghi âm…" : recorded ? "Đã ghi xong" : "Chưa ghi âm"}</p>
                <p className="font-mono text-lg font-bold tabular-nums text-slate-700" aria-hidden="true">
                  {mmss(recording ? elapsed : durationSec)} <span className="text-sm font-semibold text-slate-400">/ {mmss(MAX_SPEAKING_SECONDS)}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {recording ? (
                <Button variant="danger" leftIcon={<Square />} onClick={stop}>
                  Dừng
                </Button>
              ) : recorded ? (
                <Button variant="outline" leftIcon={<RotateCcw />} disabled={disabled} onClick={() => setConfirmOpen(true)}>
                  Ghi lại
                </Button>
              ) : (
                <Button leftIcon={<Mic />} disabled={disabled} onClick={() => void start()}>
                  Bắt đầu ghi
                </Button>
              )}
            </div>
          </div>

          {recorded && url && (
            <div className="mt-5">
              <p className="mb-1.5 text-sm font-bold text-slate-900">Nghe lại</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={url} className="w-full" aria-label="Nghe lại bản ghi của em" />
            </div>
          )}

          {/* Chỉ báo cho trình đọc màn hình khi trạng thái đổi, không đọc từng giây */}
          <p className="sr-only" role="status" aria-live="polite">
            {recording ? "Đang ghi âm." : recorded ? `Đã ghi xong ${durationSec} giây.` : ""}
          </p>

          {tooShort && (
            <p role="alert" className="mt-4 text-sm font-semibold text-amber-700">
              Bản ghi quá ngắn (cần ít nhất {MIN_SPEAKING_SECONDS} giây). Hãy bấm Ghi lại.
            </p>
          )}
          {notice && (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm font-semibold text-sky-700">
              <Info className="size-4 shrink-0" aria-hidden="true" />
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 text-sm font-semibold text-red-600">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <p className="mt-5 flex items-start gap-2 text-xs text-slate-500">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Bản ghi chỉ dùng để chấm và bị xóa sau khi chấm. Đừng nói thông tin cá nhân.
          </p>
        </section>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Ghi lại từ đầu?" description="Bản ghi hiện tại sẽ bị xóa và không khôi phục được.">
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            Giữ bản ghi
          </Button>
          <Button variant="danger" onClick={discard}>
            Xóa và ghi lại
          </Button>
        </div>
      </Modal>
    </div>
  );
}
