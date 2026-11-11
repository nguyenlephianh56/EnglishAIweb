import { useEffect, useState } from "react";

/** Trả về `value` sau khi nó ngừng thay đổi `delay` ms (dùng cho ô tìm kiếm). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
