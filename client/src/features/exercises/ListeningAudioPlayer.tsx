import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Play } from "lucide-react";
import { api } from "../../api/client";
import Button from "../../components/ui/Button";

export default function ListeningAudioPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController>();
  const objectUrl = useRef<string>();

  useEffect(() => () => {
    request.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  async function load() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(undefined);
    try {
      const { data } = await api.get<Blob>(path, {
        responseType: "blob",
        signal: controller.signal,
        timeout: 60_000,
      });
      if (controller.signal.aborted) return;
      objectUrl.current = URL.createObjectURL(data);
      setUrl(objectUrl.current);
    } catch (err) {
      if (controller.signal.aborted) return;
      let message = "Chưa tải được lời đọc. Hãy thử lại.";
      if (axios.isAxiosError<Blob>(err) && err.response?.data instanceof Blob) {
        const body = await err.response.data.text().then(JSON.parse).catch(() => null);
        if (typeof body?.error?.message === "string") message = body.error.message;
      }
      if (!controller.signal.aborted) setError(message);
    } finally {
      if (!controller.signal.aborted) {
        request.current = undefined;
        setLoading(false);
      }
    }
  }

  return url ? (
    <audio aria-label="Lời đọc bài nghe" src={url} controls className="w-full" />
  ) : (
    <div className="space-y-2">
      <Button leftIcon={<Play />} loading={loading} onClick={() => void load()}>
        {error ? "Thử tải lại lời đọc" : "Tải lời đọc"}
      </Button>
      {loading && <p role="status" className="text-sm text-slate-600">Đang chuẩn bị audio. Lần đầu có thể mất vài giây.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}