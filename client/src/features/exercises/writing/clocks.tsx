import { useEffect, useState } from "react";

/** Số giây trôi qua kể từ lúc component được gắn (tính theo đồng hồ hệ thống nên không lệch khi tab bị giảm tốc). */
function useSeconds(): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setS(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return s;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "Thời gian làm" mm:ss, chỉ để hiển thị (tách component riêng để mỗi giây không vẽ lại cả trang làm bài) */
export function ElapsedClock() {
  const s = useSeconds();
  return (
    <span className="tabular-nums" aria-label={`Đã làm ${Math.floor(s / 60)} phút ${s % 60} giây`}>
      {pad(Math.floor(s / 60))}:{pad(s % 60)}
    </span>
  );
}

/** Số giây đã chờ AI chấm (gắn khi bắt đầu chờ, gỡ khi xong) */
export function WaitedSeconds() {
  return <>{useSeconds()}</>;
}
