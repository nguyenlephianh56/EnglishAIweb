import { describe, expect, it } from "vitest";
import {
  DEADLINE_NOTIFICATION_KEY_PATTERN,
  GRADED_NOTIFICATION_KEY_PATTERN,
  GRADED_NOTIFICATION_TYPE,
  GRADED_NOTIFY_FAILED,
  REMINDER_LABELS,
  TEACHER_EDIT_NOTIFICATION_KEY_PATTERN,
  gradedNotificationKey,
  teacherEditNotificationKey,
} from "./notifications.constants";
import { buildGradedMessage } from "./notifications.graded";
import { buildTeacherEditMessage } from "./notifications.teacher-edit";

const build = (topic = "Unit 1", className = "Lớp A") => buildGradedMessage({ topic, className });

describe("buildGradedMessage – mẫu cố định", () => {
  it("đúng mẫu tiếng Việt", () => {
    expect(build()).toBe("Giáo viên đã chấm bài «Unit 1» của lớp Lớp A.");
  });

  it("không chứa chữ số, email hay ký tự điều khiển khi topic/lớp sạch", () => {
    expect(build("Unit", "Lớp A")).not.toMatch(/[0-9@<>\r\n]/);
  });
});

describe("buildGradedMessage – làm sạch topic/tên lớp", () => {
  it("bỏ HTML, xuống dòng và email", () => {
    const message = build("<b>Unit 1</b>\nliên hệ a.b@example.com", "Lớp\r\n<i>B</i>");
    expect(message).toBe("Giáo viên đã chấm bài «Unit 1 liên hệ» của lớp Lớp B.");
    expect(message).not.toMatch(/[<>@\r\n]/);
  });

  it("cắt theo độ dài tối đa", () => {
    const message = build("x".repeat(500), "y".repeat(500));
    expect(message).toContain(`«${"x".repeat(REMINDER_LABELS.topic.maxChars)}»`);
    expect(message).toContain(`lớp ${"y".repeat(REMINDER_LABELS.className.maxChars)}.`);
    expect(message).not.toContain("x".repeat(REMINDER_LABELS.topic.maxChars + 1));
    expect(message).not.toContain("y".repeat(REMINDER_LABELS.className.maxChars + 1));
  });

  it("topic/tên lớp rỗng hoặc chỉ khoảng trắng thì dùng chữ thay thế", () => {
    for (const empty of ["", "   ", "\n\t", "<br>"]) {
      expect(build(empty, empty)).toBe(
        `Giáo viên đã chấm bài «${REMINDER_LABELS.topic.fallback}» của lớp ${REMINDER_LABELS.className.fallback}.`
      );
    }
  });

  it("message không chứa điểm số hay nhận xét (mẫu chỉ có topic và tên lớp)", () => {
    expect(build("Unit", "Lớp")).not.toMatch(/điểm|nhận xét|\d/);
  });
});

describe("khóa graded:<attemptId>", () => {
  it("dựng khóa đúng định dạng và khớp regexp", () => {
    const key = gradedNotificationKey(42);
    expect(key).toBe("graded:42");
    expect(GRADED_NOTIFICATION_KEY_PATTERN.test(key)).toBe(true);
  });

  it("API T25 cắt ra type graded và không coi là khóa deadline hay teacher_edit", () => {
    const key = gradedNotificationKey(7);
    expect(key.split(":", 1)[0]).toBe(GRADED_NOTIFICATION_TYPE);
    expect(DEADLINE_NOTIFICATION_KEY_PATTERN.test(key)).toBe(false);
    expect(TEACHER_EDIT_NOTIFICATION_KEY_PATTERN.test(key)).toBe(false);
  });

  it.each([
    "graded",
    "graded:",
    "graded:0",
    "graded:01",
    "graded:-1",
    "graded:1.5",
    "graded:abc",
    "graded:1:2",
    "graded:1\n",
    " graded:1",
    "xgraded:1",
    "deadline:1:2",
    "teacher_edit:1",
  ])("regexp từ chối khóa sai %j", (key) => {
    expect(GRADED_NOTIFICATION_KEY_PATTERN.test(key)).toBe(false);
  });
});

describe("không ảnh hưởng teacher_edit", () => {
  it("khóa và message teacher_edit giữ nguyên", () => {
    expect(teacherEditNotificationKey(42)).toBe("teacher_edit:42");
    expect(TEACHER_EDIT_NOTIFICATION_KEY_PATTERN.test("graded:42")).toBe(false);
    expect(
      buildTeacherEditMessage({ scoreChanged: true, commentChanged: false, topic: "Unit 1", className: "Lớp A" })
    ).toBe("Giáo viên đã cập nhật điểm bài «Unit 1» của lớp Lớp A.");
  });

  it("mã lỗi graded khác mã teacher_edit", () => {
    expect(GRADED_NOTIFY_FAILED).toBe("GRADED_NOTIFY_FAILED");
  });
});