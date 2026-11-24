import Notice from "../../account/Notice";

/** Hiện khi máy chủ báo dữ liệu còn ít */
export default function LimitedDataNote({ show }: { show: boolean }) {
  return show ? <Notice type="warning">Dữ liệu còn ít nên kết quả chỉ mang tính tham khảo.</Notice> : null;
}
