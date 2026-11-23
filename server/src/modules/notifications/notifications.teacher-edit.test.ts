import { describe, expect, it } from "vitest";
import {
  DEADLINE_NOTIFICATION_KEY_PATTERN,
  REMINDER_LABELS,
  TEACHER_EDIT_NOTIFICATION_KEY_PATTERN,
  TEACHER_EDIT_NOTIFICATION_TYPE,
  teacherEditNotificationKey,
} from "./notifications.constants";
import { buildTeacherEditMessage } from "./notifications.teacher-edit";

const build = (
  scoreChanged: boolean,
  commentChanged: boolean,
  topic = "Unit 1",
  className = "Lớp A"
) => buildTeacherEditMessage({ scoreChanged, commentChanged, topic, className });

describe("buildTeacherEditMessage – 3 mẫu", () => {
  it("chỉ đổi điểm", () => {
    expect(build(true, false)).toBe("Giáo viên đã cập nhật điểm bài «Unit 1» của lớp Lớp A.");
  });

  it("chỉ đổi nhận xét", () => {
    expect(build(false, true)).toBe("Giáo viên đã cập nhật nhận xét bài «Unit 1» của lớp Lớp A.");
  });

  it("đổi cả hai", () => {
    expect(build(true, true)).toBe(
      "Giáo viên đã cập nhật điểm và nhận xét bài «Unit 1» của lớp Lớp A."
    );
  });

  it("không đổi gì thì không có message", () => {
    expect(build(false, false)).toBeNull();
  });

  it("message không chứa chữ số, tên GV hay email khi topic/lớp sạch", () => {
    for (const [s, c] of [[true, false], [false, true], [true, true]] as const) {
      expect(build(s, c, "Unit Mot")).toMatch(/^Giáo viên đã cập nhật [^\d@]*$/u);
    }
  });
});

describe("buildTeacherEditMessage – làm sạch topic/tên lớp", () => {
  it("bỏ HTML, xuống dòng và email", () => {
    const message = build(true, false, "<b>Unit 1</b>\nliên hệ a.b@example.com", "Lớp\r\n<i>B</i>")!;
    expect(message).toBe("Giáo viên đã cập nhật điểm bài «Unit 1 liên hệ» của lớp Lớp B.");
    expect(message).not.toMatch(/[<>@\r\n]/);
  });

  it("cắt theo độ dài tối đa", () => {
    const message = build(true, false, "x".repeat(500), "y".repeat(500))!;
    expect(message).toContain(`«${"x".repeat(REMINDER_LABELS.topic.maxChars)}»`);
    expect(message).toContain(`lớp ${"y".repeat(REMINDER_LABELS.className.maxChars)}.`);
    expect(message).not.toContain("x".repeat(REMINDER_LABELS.topic.maxChars + 1));
    expect(message).not.toContain("y".repeat(REMINDER_LABELS.className.maxChars + 1));
  });

  it("topic/tên lớp rỗng hoặc chỉ khoảng trắng thì dùng chữ thay thế", () => {
    for (const empty of ["", "   ", "\n\t", "<br>"]) {
      expect(build(false, true, empty, empty)).toBe(
        `Giáo viên đã cập nhật nhận xét bài «${REMINDER_LABELS.topic.fallback}» của lớp ${REMINDER_LABELS.className.fallback}.`
      );
    }
  });
});

describe("khóa teacher_edit:<attemptId>", () => {
  it("dựng khóa đúng định dạng và khớp regexp", () => {
    const key = teacherEditNotificationKey(42);
    expect(key).toBe("teacher_edit:42");
    expect(TEACHER_EDIT_NOTIFICATION_KEY_PATTERN.test(key)).toBe(true);
  });

  it("API T25 vẫn cắt ra type teacher_edit và không coi là khóa deadline", () => {
    const key = teacherEditNotificationKey(7);
    expect(key.split(":", 1)[0]).toBe(TEACHER_EDIT_NOTIFICATION_TYPE);
    expect(DEADLINE_NOTIFICATION_KEY_PATTERN.test(key)).toBe(false);
  });

  it.each([
    "teacher_edit",
    "teacher_edit:",
    "teacher_edit:0",
    "teacher_edit:01",
    "teacher_edit:-1",
    "teacher_edit:1.5",
    "teacher_edit:abc",
    "teacher_edit:1:2",
    "teacher_edit:1\n",
    " teacher_edit:1",
    "xteacher_edit:1",
    "deadline:1:2",
    "graded:1",
  ])("regexp từ chối khóa sai %j", (key) => {
    expect(TEACHER_EDIT_NOTIFICATION_KEY_PATTERN.test(key)).toBe(false);
  });
});