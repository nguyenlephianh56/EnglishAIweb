// =====================================================================
// learning-paths/learning-paths.week.ts — Tính `week_start` (thứ Hai của tuần) theo múi giờ cấu hình (T24).
//
// Hàm THUẦN: không DB, không đọc env (múi giờ truyền vào), chỉ dùng `Intl` có sẵn của Node.
//
// VÌ SAO CẦN MÚI GIỜ: cùng một thời điểm, UTC có thể còn "Chủ nhật" trong khi Việt Nam (UTC+7) đã là
// "thứ Hai". Tuần của HS phải theo giờ địa phương, không theo UTC.
// =====================================================================

/** Chỉ số thứ trong tuần, thứ Hai = 0 ... Chủ nhật = 6 (tuần bắt đầu thứ Hai). */
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** Múi giờ IANA có hợp lệ không (vd "Asia/Ho_Chi_Minh"). Dùng để kiểm .env khi khởi động. */
export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Trả về ngày thứ Hai của tuần chứa `now`, tính theo `timeZone`.
 *
 * Kết quả là `Date` ở 00:00 UTC của ngày đó (đúng kiểu Prisma cần cho cột `DATE`):
 * `getWeekStart(2026-11-21 ở Việt Nam)` -> `2026-11-16T00:00:00.000Z`.
 *
 * Ném RangeError nếu `timeZone` sai (nên kiểm bằng `isValidTimeZone` ở env).
 */
export const getWeekStart = (now: Date, timeZone: string): Date => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(now);

  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const weekdayIndex = WEEKDAY_INDEX[read("weekday")];

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || weekdayIndex === undefined) {
    throw new RangeError("Không đọc được ngày theo múi giờ đã cho");
  }

  // Date.UTC tự xử lý ngày âm/tràn tháng, tràn năm (vd ngày 1 trừ 3 ngày -> cuối tháng trước).
  return new Date(Date.UTC(year, month - 1, day - weekdayIndex));
};