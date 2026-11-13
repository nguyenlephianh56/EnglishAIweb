import { describe, expect, it } from "vitest";
import { generateExerciseSchema } from "./exercises.generate.schema";

const validBody = (overrides: Record<string, unknown> = {}) => ({
  skill: "READING",
  level: "A1",
  topic: "Daily routines",
  type: "multiple_choice",
  count: 3,
  ...overrides,
});

// Kỳ vọng lấy từ bảng 4b, không lấy từ map trong schema đang được kiểm tra.
const validPairs = [
  ["multiple_choice", "READING"],
  ["fill_blank", "FOUNDATION"],
  ["fill_blank", "READING"],
  ["matching", "FOUNDATION"],
  ["error_correction", "WRITING"],
  ["error_correction", "FOUNDATION"],
  ["listening_fill", "LISTENING"],
  ["writing", "WRITING"],
  ["speaking", "SPEAKING"],
] as const;

describe("generateExerciseSchema - các field bắt buộc", () => {
  it("nhận đúng 5 field của một yêu cầu hợp lệ", () => {
    expect(generateExerciseSchema.parse(validBody())).toEqual(validBody());
  });

  it.each(["skill", "level", "topic", "type", "count"])(
    "thiếu %s bị từ chối và chỉ rõ field",
    (field) => {
      const body: Record<string, unknown> = validBody();
      delete body[field];

      const result = generateExerciseSchema.safeParse(body);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue) => issue.path[0] === field)
        ).toBe(true);
      }
    }
  );

  it.each([undefined, null, [], "invalid", 1])(
    "từ chối body không phải object: %j",
    (body) => {
      expect(generateExerciseSchema.safeParse(body).success).toBe(false);
    }
  );

  it.each([
    ["skill", "COOKING"],
    ["level", "C2"],
    ["type", "essay"],
    ["skill", null],
    ["level", 1],
    ["type", []],
    ["topic", 123],
  ])("từ chối %s = %j", (field, value) => {
    expect(
      generateExerciseSchema.safeParse(
        validBody({ [field as string]: value })
      ).success
    ).toBe(false);
  });

  it.each(["A1", "A2", "B1", "B2"])("nhận cấp độ %s", (level) => {
    expect(
      generateExerciseSchema.safeParse(validBody({ level })).success
    ).toBe(true);
  });
});

describe("generateExerciseSchema - count", () => {
  it.each([0, -1, 1.5, "1", 11, null, true, Number.NaN, Infinity])(
    "từ chối count không hợp lệ: %j",
    (count) => {
      expect(
        generateExerciseSchema.safeParse(validBody({ count })).success
      ).toBe(false);
    }
  );

  it.each([1, 10])(
    "nhận biên count = %i cho multiple_choice",
    (count) => {
      expect(
        generateExerciseSchema.safeParse(validBody({ count })).success
      ).toBe(true);
    }
  );

  it.each([
    ["fill_blank", "FOUNDATION"],
    ["listening_fill", "LISTENING"],
  ])("nhận count 1 và 10 cho %s", (type, skill) => {
    for (const count of [1, 10]) {
      expect(
        generateExerciseSchema.safeParse(
          validBody({ type, skill, count })
        ).success
      ).toBe(true);
    }
  });

  it("matching chỉ nhận từ 2 đến 10 cặp", () => {
    for (const count of [1, 2, 10, 11]) {
      const result = generateExerciseSchema.safeParse(
        validBody({ type: "matching", skill: "FOUNDATION", count })
      );

      expect(result.success).toBe(count === 2 || count === 10);
    }
  });

  it.each([
    ["error_correction", "WRITING"],
    ["writing", "WRITING"],
    ["speaking", "SPEAKING"],
  ])("%s chỉ nhận count = 1", (type, skill) => {
    for (const count of [0, 1, 2, 10]) {
      expect(
        generateExerciseSchema.safeParse(
          validBody({ type, skill, count })
        ).success
      ).toBe(count === 1);
    }
  });
});

describe("generateExerciseSchema - topic", () => {
  it.each(["", "   ", "a", "a".repeat(101)])(
    "từ chối độ dài không hợp lệ: %j",
    (topic) => {
      expect(
        generateExerciseSchema.safeParse(validBody({ topic })).success
      ).toBe(false);
    }
  );

  it.each([2, 100])("nhận chủ đề dài %i ký tự", (length) => {
    expect(
      generateExerciseSchema.safeParse(
        validBody({ topic: "a".repeat(length) })
      ).success
    ).toBe(true);
  });

  it("trim khoảng trắng đầu/cuối trước khi kiểm tra độ dài và trả dữ liệu", () => {
    const topic = "a".repeat(100);

    expect(
      generateExerciseSchema.parse(
        validBody({ topic: `  ${topic}  ` })
      ).topic
    ).toBe(topic);
  });

  it("từ chối chủ đề chỉ còn 1 ký tự sau trim", () => {
    expect(
      generateExerciseSchema.safeParse(
        validBody({ topic: "  a  " })
      ).success
    ).toBe(false);
  });

  const controlCodes = [
    ...Array.from({ length: 32 }, (_, code) => code),
    ...Array.from({ length: 33 }, (_, index) => 127 + index),
  ];

  it.each(controlCodes)(
    "từ chối ký tự điều khiển mã %i ở đầu/giữa/cuối",
    (code) => {
      const control = String.fromCharCode(code);

      for (const topic of [
        `${control}Daily routines`,
        `Daily${control}routines`,
        `Daily routines${control}`,
      ]) {
        const result = generateExerciseSchema.safeParse(
          validBody({ topic })
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(
            result.error.issues.some((issue) =>
              issue.message.includes("ký tự điều khiển")
            )
          ).toBe(true);
        }
      }
    }
  );
});

describe("generateExerciseSchema - cặp skill/type", () => {
  it.each(validPairs)("nhận cặp %s + %s", (type, skill) => {
    const count = type === "matching" ? 2 : 1;

    expect(
      generateExerciseSchema.safeParse(
        validBody({ type, skill, count })
      ).success
    ).toBe(true);
  });

  const skills = [
    "LISTENING",
    "SPEAKING",
    "READING",
    "WRITING",
    "FOUNDATION",
  ];

  const types = [...new Set(validPairs.map(([type]) => type))];

  const invalidPairs = types.flatMap((type) =>
    skills
      .filter(
        (skill) =>
          !validPairs.some(
            ([validType, validSkill]) =>
              validType === type && validSkill === skill
          )
      )
      .map((skill) => [type, skill])
  );

  it.each(invalidPairs)(
    "từ chối cặp %s + %s và nêu kỹ năng hợp lệ",
    (type, skill) => {
      const count = type === "matching" ? 2 : 1;

      const result = generateExerciseSchema.safeParse(
        validBody({ type, skill, count })
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (item) => item.path[0] === "skill"
        );

        expect(issue?.message).toContain(type);

        for (const [, allowedSkill] of validPairs.filter(
          ([validType]) => validType === type
        )) {
          expect(issue?.message).toContain(allowedSkill);
        }
      }
    }
  );
});

describe("generateExerciseSchema - field thừa", () => {
  it.each([
    "status",
    "source",
    "in_library",
    "created_by_id",
    "inLibrary",
    "createdById",
    "content",
    "answer",
    "unexpected",
  ])("từ chối field %s thay vì âm thầm bỏ qua", (field) => {
    const result = generateExerciseSchema.safeParse(
      validBody({ [field]: "PRIVATE_VALUE" })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (item) => item.code === "unrecognized_keys"
      );

      expect(issue).toBeDefined();
      expect(issue?.message).toContain("Chỉ chấp nhận");
      expect(issue?.message).not.toContain("PRIVATE_VALUE");
    }
  });
});