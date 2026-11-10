import { describe, it, expect } from "vitest";
import {
  createExerciseSchema,
  TOPIC_MAX_LENGTH,
  EXPLANATION_MAX_LENGTH,
} from "./exercises.schema";

/** Body hợp lệ tối thiểu (fill_blank). Mỗi test sửa 1 field để thử. */
const validBody = () => ({
  type: "fill_blank",
  skill: "FOUNDATION",
  level: "A1",
  topic: "Present simple",
  content: { text: "She ___ to school." },
  answer: ["goes"],
});

/** Parse và trả về mảng message lỗi (rỗng nếu hợp lệ). */
const errorsOf = (body: unknown): string[] => {
  const result = createExerciseSchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("createExerciseSchema - body hợp lệ", () => {
  it("chấp nhận body hợp lệ và giữ nguyên content/answer", () => {
    const result = createExerciseSchema.safeParse(validBody());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toEqual({ text: "She ___ to school." });
      expect(result.data.answer).toEqual(["goes"]);
      expect(result.data.explanation).toBeNull();
    }
  });

  it("chấp nhận writing không có answer", () => {
    const result = createExerciseSchema.safeParse({
      type: "writing",
      skill: "WRITING",
      level: "B1",
      topic: "My hometown",
      content: { prompt: "Describe your hometown.", minWords: 80 },
    });
    expect(result.success).toBe(true);
  });

  it("trim topic và explanation", () => {
    const result = createExerciseSchema.safeParse({
      ...validBody(),
      topic: "  Present simple  ",
      explanation: "  Ngôi thứ 3 thêm es  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topic).toBe("Present simple");
      expect(result.data.explanation).toBe("Ngôi thứ 3 thêm es");
    }
  });

  it("explanation rỗng, toàn khoảng trắng hoặc null -> null", () => {
    for (const explanation of ["", "   ", null]) {
      const result = createExerciseSchema.safeParse({ ...validBody(), explanation });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.explanation).toBeNull();
    }
  });

  it("BỎ các field server tự đặt nếu client gửi thừa", () => {
    const result = createExerciseSchema.safeParse({
      ...validBody(),
      status: "PUBLISHED",
      source: "ADMIN",
      inLibrary: true,
      in_library: true,
      createdById: 999,
      created_by_id: 999,
      createdAt: "2000-01-01",
      id: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      for (const key of [
        "status",
        "source",
        "inLibrary",
        "in_library",
        "createdById",
        "created_by_id",
        "createdAt",
        "id",
      ]) {
        expect(result.data).not.toHaveProperty(key);
      }
    }
  });

  it("publish là boolean tùy chọn", () => {
    const withTrue = createExerciseSchema.safeParse({ ...validBody(), publish: true });
    expect(withTrue.success && withTrue.data.publish).toBe(true);
    const without = createExerciseSchema.safeParse(validBody());
    expect(without.success && without.data.publish).toBeUndefined();
  });
});

describe("createExerciseSchema - body không hợp lệ", () => {
  it("type lạ hoặc thiếu", () => {
    const unknown = errorsOf({ ...validBody(), type: "essay" });
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatch(/^type: /);

    const { type: _type, ...missing } = validBody();
    expect(errorsOf(missing)[0]).toMatch(/^type: /);
  });

  it("skill ngoài enum", () => {
    const errors = errorsOf({ ...validBody(), skill: "COOKING" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^skill: /);
  });

  it("skill viết thường cũng bị từ chối (enum phân biệt hoa/thường)", () => {
    expect(errorsOf({ ...validBody(), skill: "foundation" })[0]).toMatch(/^skill: /);
  });

  it("level ngoài enum", () => {
    const errors = errorsOf({ ...validBody(), level: "C2" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^level: /);
  });

  it("topic rỗng, toàn khoảng trắng, thiếu hoặc sai kiểu", () => {
    expect(errorsOf({ ...validBody(), topic: "" })[0]).toMatch(/^topic: .*không được để trống/);
    expect(errorsOf({ ...validBody(), topic: "    " })[0]).toMatch(/^topic: .*không được để trống/);
    const { topic: _topic, ...missing } = validBody();
    expect(errorsOf(missing)[0]).toMatch(/^topic: /);
    expect(errorsOf({ ...validBody(), topic: 123 })[0]).toMatch(/^topic: /);
  });

  it("topic vượt giới hạn độ dài", () => {
    expect(errorsOf({ ...validBody(), topic: "a".repeat(TOPIC_MAX_LENGTH) })).toEqual([]);
    const errors = errorsOf({ ...validBody(), topic: "a".repeat(TOPIC_MAX_LENGTH + 1) });
    expect(errors[0]).toMatch(/^topic: .*không được vượt quá/);
  });

  it("explanation sai kiểu hoặc quá dài", () => {
    expect(errorsOf({ ...validBody(), explanation: 123 })[0]).toMatch(/^explanation: /);
    expect(
      errorsOf({ ...validBody(), explanation: "a".repeat(EXPLANATION_MAX_LENGTH + 1) })[0]
    ).toMatch(/^explanation: /);
  });

  it("publish sai kiểu", () => {
    expect(errorsOf({ ...validBody(), publish: "true" })[0]).toMatch(/^publish: /);
    expect(errorsOf({ ...validBody(), publish: 1 })[0]).toMatch(/^publish: /);
  });

  it("body không phải object", () => {
    expect(errorsOf(null).length).toBeGreaterThan(0);
    expect(errorsOf("abc").length).toBeGreaterThan(0);
  });
});

describe("createExerciseSchema - skill theo type", () => {
  const cases: Array<[string, string, string]> = [
    ["listening_fill", "LISTENING", "READING"],
    ["writing", "WRITING", "FOUNDATION"],
    ["speaking", "SPEAKING", "WRITING"],
  ];

  it.each(cases)("%s chỉ chấp nhận %s", (type, goodSkill, badSkill) => {
    expect(errorsOf({ ...validBody(), type, skill: goodSkill })).toEqual([]);

    const errors = errorsOf({ ...validBody(), type, skill: badSkill });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^skill: .*chỉ dùng với kỹ năng/);
    expect(errors[0]).toContain(goodSkill);
  });

  it("4 dạng còn lại: skill tự do", () => {
    for (const type of ["multiple_choice", "fill_blank", "matching", "error_correction"]) {
      for (const skill of ["LISTENING", "SPEAKING", "READING", "WRITING", "FOUNDATION"]) {
        expect(errorsOf({ ...validBody(), type, skill })).toEqual([]);
      }
    }
  });
});