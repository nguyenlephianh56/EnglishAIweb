/**
 * Test hàm thuần getWeekStart / isValidTimeZone (T24). Không cần DB hay .env.
 * Mốc: 2026-11-21 là thứ Bảy; 2026-11-22 là Chủ nhật; 2026-11-23 là thứ Hai.
 */
import { describe, it, expect } from "vitest";
import { getWeekStart, isValidTimeZone } from "./learning-paths.week";

const VN = "Asia/Ho_Chi_Minh"; // UTC+7, không đổi giờ mùa hè
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("getWeekStart (Asia/Ho_Chi_Minh)", () => {
  it("giữa tuần trả về thứ Hai của tuần đó (00:00 UTC, đúng kiểu cột DATE)", () => {
    const result = getWeekStart(new Date("2026-11-21T05:00:00+07:00"), VN); // thứ Bảy
    expect(result.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });

  it("Chủ nhật 23:59 giờ VN vẫn thuộc tuần cũ", () => {
    expect(iso(getWeekStart(new Date("2026-11-22T23:59:59.999+07:00"), VN))).toBe("2026-11-16");
  });

  it("thứ Hai 00:00 giờ VN đã sang tuần mới, dù UTC vẫn còn Chủ nhật", () => {
    const now = new Date("2026-11-23T00:00:00+07:00");
    expect(now.toISOString()).toBe("2026-11-22T17:00:00.000Z"); // UTC vẫn là ngày trước
    expect(iso(getWeekStart(now, VN))).toBe("2026-11-23");
  });

  it("1 ms trước thứ Hai 00:00 giờ VN vẫn là tuần cũ", () => {
    expect(iso(getWeekStart(new Date("2026-11-22T16:59:59.999Z"), VN))).toBe("2026-11-16");
  });

  it("đúng thứ Hai thì trả về chính ngày đó", () => {
    expect(iso(getWeekStart(new Date("2026-06-01T12:00:00+07:00"), VN))).toBe("2026-06-01");
  });

  it("đầu năm: 01/01/2026 (thứ Năm) thuộc tuần bắt đầu 29/12/2025", () => {
    expect(iso(getWeekStart(new Date("2026-01-01T12:00:00+07:00"), VN))).toBe("2025-12-29");
  });

  it("cuối năm: 31/12/2026 và 01/01/2027 cùng tuần bắt đầu 28/12/2026", () => {
    expect(iso(getWeekStart(new Date("2026-12-31T23:00:00+07:00"), VN))).toBe("2026-12-28");
    expect(iso(getWeekStart(new Date("2027-01-01T08:00:00+07:00"), VN))).toBe("2026-12-28");
  });

  it("đầu tháng: 01/09/2026 (thứ Ba) -> 31/08/2026; 01/03/2026 (Chủ nhật) -> 23/02/2026", () => {
    expect(iso(getWeekStart(new Date("2026-09-01T09:00:00+07:00"), VN))).toBe("2026-08-31");
    expect(iso(getWeekStart(new Date("2026-03-01T09:00:00+07:00"), VN))).toBe("2026-02-23");
  });
});

describe("getWeekStart (múi giờ khác)", () => {
  it("UTC thứ Hai 03:00 nhưng Los Angeles vẫn Chủ nhật -> tuần cũ", () => {
    const now = new Date("2026-11-23T03:00:00Z");
    expect(iso(getWeekStart(now, "UTC"))).toBe("2026-11-23");
    expect(iso(getWeekStart(now, "America/Los_Angeles"))).toBe("2026-11-16");
  });

  it("múi giờ sai thì ném RangeError", () => {
    expect(() => getWeekStart(new Date(), "Khong/Ton_Tai")).toThrow(RangeError);
  });
});

describe("isValidTimeZone", () => {
  it("nhận múi giờ IANA hợp lệ, từ chối chuỗi sai", () => {
    expect(isValidTimeZone("Asia/Ho_Chi_Minh")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Khong/Ton_Tai")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});