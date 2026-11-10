/**
 * Test thuần (không cần DB) cho toStudentView: HS không bao giờ nhận `answer`.
 */
import { describe, it, expect } from "vitest";
import { toStudentView } from "./exercise-view";

// Giả lập một dòng exercises đầy đủ như Prisma trả về (có cả field HS không được thấy)
const fullExercise = () => ({
  id: 42,
  type: "fill_blank",
  skill: "FOUNDATION",
  level: "A1",
  topic: "Present simple",
  content: { text: "She ___ to school.", hint: "go" },
  answer: ["goes"],
  explanation: "Chủ ngữ ngôi thứ ba số ít nên thêm -es.",
  status: "PUBLISHED",
  source: "ADMIN",
  inLibrary: true,
  createdById: 1,
  createdAt: new Date("2026-11-08T00:00:00Z"),
  updatedAt: new Date("2026-11-08T00:00:00Z"),
});

// Tìm key "answer" bất kỳ chỗ nào trong JSON (không bị nhầm với chữ "answer" nằm trong nội dung câu)
const hasAnswerKey = (value: unknown) => /"answer"\s*:/.test(JSON.stringify(value));

describe("toStudentView - che đáp án", () => {
  it("mặc định: chỉ có đúng 6 field cho phép, không có answer/explanation", () => {
    const view = toStudentView(fullExercise());
    expect(Object.keys(view).sort()).toEqual(
      ["content", "id", "level", "skill", "topic", "type"].sort()
    );
  });

  it("JSON đầu ra không chứa key answer và không lộ nội dung explanation", () => {
    const json = JSON.stringify(toStudentView(fullExercise()));
    expect(hasAnswerKey(json)).toBe(false);
    expect(json).not.toContain("goes");
    expect(json).not.toContain("Chủ ngữ ngôi thứ ba");
  });

  it("không lộ field nội bộ: status, source, inLibrary, createdById, createdAt, updatedAt", () => {
    const view = toStudentView(fullExercise()) as unknown as Record<string, unknown>;
    for (const key of ["status", "source", "inLibrary", "createdById", "createdAt", "updatedAt"]) {
      expect(key in view).toBe(false);
    }
  });

  it("danh sách trắng: field lạ thêm vào sau này cũng không lọt ra", () => {
    const withExtra = { ...fullExercise(), secretNote: "chỉ GV được xem" };
    const view = toStudentView(withExtra);
    expect("secretNote" in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain("chỉ GV được xem");
  });

  it("giữ nguyên dữ liệu hiển thị: id, type, skill, level, topic, content", () => {
    const view = toStudentView(fullExercise());
    expect(view).toEqual({
      id: 42,
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: "Present simple",
      content: { text: "She ___ to school.", hint: "go" },
    });
  });
});

describe("toStudentView - explanation chỉ khi được lộ", () => {
  it("revealExplanation=true: có explanation nhưng vẫn KHÔNG có answer", () => {
    const view = toStudentView(fullExercise(), { revealExplanation: true });
    expect(view.explanation).toBe("Chủ ngữ ngôi thứ ba số ít nên thêm -es.");
    expect(hasAnswerKey(view)).toBe(false);
    expect("answer" in view).toBe(false);
  });

  it("revealExplanation=true nhưng bài không có giải thích: explanation = null", () => {
    const view = toStudentView({ ...fullExercise(), explanation: null }, { revealExplanation: true });
    expect(view.explanation).toBeNull();
  });

  it("revealExplanation=false hoặc không truyền: không có key explanation", () => {
    expect("explanation" in toStudentView(fullExercise())).toBe(false);
    expect("explanation" in toStudentView(fullExercise(), { revealExplanation: false })).toBe(false);
    expect("explanation" in toStudentView(fullExercise(), {})).toBe(false);
  });
});

describe("toStudentView - các trường hợp khác", () => {
  it("bài writing có answer = null vẫn không có key answer", () => {
    const writing = {
      ...fullExercise(),
      type: "writing",
      skill: "WRITING",
      content: { prompt: "Describe your hometown.", minWords: 80 },
      answer: null,
    };
    const view = toStudentView(writing);
    expect("answer" in view).toBe(false);
  });

  it("không sửa object gốc (GV/admin vẫn dùng được bản đầy đủ)", () => {
    const original = fullExercise();
    toStudentView(original, { revealExplanation: true });
    expect(original.answer).toEqual(["goes"]);
    expect(original.status).toBe("PUBLISHED");
  });
});