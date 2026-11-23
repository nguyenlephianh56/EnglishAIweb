/** Đưa con trỏ tới ô báo lỗi đầu tiên trong `root` (sau khi React đã vẽ lỗi) */
export function focusFirstInvalid(root: HTMLElement | null) {
  window.requestAnimationFrame(() => {
    const first = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.scrollIntoView({ block: "center" });
    first?.focus({ preventScroll: true });
  });
}
