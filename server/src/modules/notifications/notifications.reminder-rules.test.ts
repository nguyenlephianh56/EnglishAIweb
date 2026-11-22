import { describe, expect, it } from "vitest";
import { MAX_REMIND_HOURS } from "../assignments/assignments.constants";
import { REMINDER_HOUR_MS, REMINDER_LABELS, REMINDER_MINUTE_MS } from "./notifications.constants";
import { buildDeadlineMessage, computeDueMark, formatRemaining } from "./notifications.reminder-rules";

const dueAt = new Date("2026-11-22T17:30:00.000Z");
const createdAt = new Date("2026-11-14T17:30:00.000Z");
const beforeDue = (hours: number) => new Date(dueAt.getTime() - hours * REMINDER_HOUR_MS);
const schedule = (remindBeforeHours: readonly number[], created = createdAt) => ({
  dueAt,
  createdAt: created,
  remindBeforeHours,
});

describe("computeDueMark", () => {
  it("bỏ qua trước trigger và nhận ngay tại trigger", () => {
    const trigger = beforeDue(2);
    expect(computeDueMark(schedule([2]), new Date(trigger.getTime() - 1))).toBeNull();
    expect(computeDueMark(schedule([2]), trigger)).toBe(2);
  });

  it("bỏ qua đúng hạn và sau hạn", () => {
    expect(computeDueMark(schedule([1, 2]), dueAt)).toBeNull();
    expect(computeDueMark(schedule([1, 2]), new Date(dueAt.getTime() + 1))).toBeNull();
  });

  it("chọn mốc nhỏ nhất đã đến trong mảng chưa sắp xếp", () => {
    expect(computeDueMark(schedule([2, 24, 1, 6]), beforeDue(1.5))).toBe(2);
  });

  it("bỏ trigger trước lúc giao bài, nhận trigger đúng lúc giao bài", () => {
    expect(computeDueMark(schedule([6, 2], beforeDue(3)), beforeDue(2.5))).toBeNull();
    expect(computeDueMark(schedule([6, 2], beforeDue(2)), beforeDue(2))).toBe(2);
  });

  it("nhận các mốc hợp lệ ở biên 1 và MAX_REMIND_HOURS", () => {
    expect(computeDueMark(schedule([1]), beforeDue(1))).toBe(1);
    expect(computeDueMark(schedule([MAX_REMIND_HOURS]), beforeDue(MAX_REMIND_HOURS))).toBe(MAX_REMIND_HOURS);
  });

  it("bỏ qua mảng rỗng, mốc lỗi và vẫn chọn đúng khi mốc hợp lệ bị trùng", () => {
    const invalidMarks = [0, -1, 1.5, MAX_REMIND_HOURS + 1, Number.NaN, Number.POSITIVE_INFINITY];
    expect(computeDueMark(schedule([]), beforeDue(1.5))).toBeNull();
    expect(computeDueMark(schedule(invalidMarks), beforeDue(1.5))).toBeNull();
    expect(computeDueMark(schedule(Object.freeze([...invalidMarks, 4, 4])), beforeDue(1.5))).toBe(4);
  });
});

describe("formatRemaining", () => {
  it.each([
    [1, "1 phút"],
    [REMINDER_MINUTE_MS + 1, "2 phút"],
    [59 * REMINDER_MINUTE_MS + 59_000, "60 phút"],
    [REMINDER_HOUR_MS, "1 giờ"],
    [47 * REMINDER_HOUR_MS + 59 * REMINDER_MINUTE_MS, "47 giờ"],
    [48 * REMINDER_HOUR_MS, "2 ngày"],
    [71 * REMINDER_HOUR_MS, "2 ngày"],
    [0, null],
    [-1, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
  ] as const)("%s ms → %s", (ms, expected) => {
    expect(formatRemaining(ms)).toBe(expected);
  });
});

describe("buildDeadlineMessage", () => {
  const input = {
    dueAt,
    now: new Date("2026-11-22T16:49:05.000Z"),
    timeZone: "Asia/Ho_Chi_Minh",
    topic: "Ôn từ vựng",
    className: "9A",
  };

  it("hiển thị ngày đổi ở UTC+07 và dùng thời gian còn lại lúc quét", () => {
    expect(buildDeadlineMessage(input))
      .toBe("Bài giao «Ôn từ vựng» của lớp 9A sắp đến hạn nộp (23/11/2026 00:30), còn khoảng 41 phút.");
    expect(buildDeadlineMessage({ ...input, timeZone: "UTC" }))
      .toBe("Bài giao «Ôn từ vựng» của lớp 9A sắp đến hạn nộp (22/11/2026 17:30), còn khoảng 41 phút.");
  });

  it("bỏ thẻ HTML, ký tự điều khiển và email rồi cắt độ dài theo ký tự", () => {
    const topicMax = REMINDER_LABELS.topic.maxChars;
    const classMax = REMINDER_LABELS.className.maxChars;
    const assignment = {
      ...input,
      topic: `<b>Ôn</b>\n\u0000 soan.bai@example.test ${"📝".repeat(topicMax)}`,
      className: `<i>Anh</i>\r\n\u001f quảnlý@example.test ${"Ữ".repeat(classMax)}`,
      student: { id: 654321, name: "Học sinh nhận tin", email: "nguoi.nhan@example.test" },
    };
    const topic = `Ôn ${"📝".repeat(topicMax - 3)}`;
    const className = `Anh ${"Ữ".repeat(classMax - 4)}`;

    expect(buildDeadlineMessage(assignment))
      .toBe(`Bài giao «${topic}» của lớp ${className} sắp đến hạn nộp (23/11/2026 00:30), còn khoảng 41 phút.`);
  });

  it("dùng nhãn mặc định khi chuỗi rỗng sau khi làm sạch", () => {
    expect(buildDeadlineMessage({ ...input, topic: "<b></b>", className: "  \n " }))
      .toBe("Bài giao «Không có tiêu đề» của lớp chưa đặt tên sắp đến hạn nộp (23/11/2026 00:30), còn khoảng 41 phút.");
  });

  it("trả null khi đã đến hạn hoặc quá hạn", () => {
    expect(buildDeadlineMessage({ ...input, now: dueAt })).toBeNull();
    expect(buildDeadlineMessage({ ...input, now: new Date(dueAt.getTime() + 1) })).toBeNull();
  });
});