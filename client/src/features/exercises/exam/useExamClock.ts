import { useEffect, useState } from "react";

/**
 * Số mili giây còn lại tới `deadline`, tính từ Date.now() mỗi 250 ms (không trừ dần một bộ đếm
 * nên tab chạy nền không bị lệch). null = không thi: trả Infinity và không chạy bộ hẹn giờ.
 */
export function useExamClock(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  return deadline === null ? Infinity : Math.max(0, deadline - now);
}
