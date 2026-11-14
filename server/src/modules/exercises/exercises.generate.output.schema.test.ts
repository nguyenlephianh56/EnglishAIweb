import { describe, expect, it } from "vitest";
import { Level, Skill } from "@prisma/client";
import { buildGeneratedExerciseSchema } from "./exercises.generate.output.schema";
import type { ExerciseType } from "./exercise-content.schema";

interface Sample {
  type: ExerciseType;
  skill: Skill;
  count: number;
  content: unknown;
  answer: unknown;
}

// Mỗi dạng 1 mẫu tối thiểu (khớp khuôn T1) kèm skill và count tương ứng.
const SAMPLES: Sample[] = [
  {
    type: "multiple_choice",
    skill: Skill.READING,
    count: 2,
    content: {
      passage: "Tom gets up at seven. He goes to school by bus.",
      questions: [
        { q: "What time does Tom get up?", options: ["At six", "At seven", "At eight"] },
        { q: "How does Tom go to school?", options: ["By bus", "By bike", "On foot"] },
      ],
    },
    answer: [1, 0],
  },
  {
    type: "fill_blank",
    skill: Skill.FOUNDATION,
    count: 1,
    content: { text: "She ___ to school every day.", hint: "go (present simple)" },
    answer: ["goes"],
  },
  {
    type: "matching",
    skill: Skill.FOUNDATION,
    count: 3,
    content: { left: ["big", "happy", "fast"], right: ["quick", "large", "glad"] },
    answer: [
      [0, 1],
      [1, 2],
      [2, 0],
    ],
  },
  {
    type: "error_correction",
    skill: Skill.WRITING,
    count: 1,
    content: { sentence: "She go to school every day.", wrong: "go" },
    answer: ["goes"],
  },
  {
    type: "listening_fill",
    skill: Skill.LISTENING,
    count: 2,
    content: { script: "Anna goes to the ___ at eight and buys some ___ for lunch.", blanks: 2 },
    answer: ["market", "bread"],
  },
  {
    type: "writing",
    skill: Skill.WRITING,
    count: 1,
    content: { prompt: "Write about what you did last weekend.", minWords: 80 },
    answer: null,
  },
  {
    type: "speaking",
    skill: Skill.SPEAKING,
    count: 1,
    content: { prompt: "Describe your daily routine.", sample: "I usually get up at six." },
    answer: null,
  },
];

const LEVEL = Level.A2;
const bySample = (type: ExerciseType) => SAMPLES.find((s) => s.type === type)!;

/** JSON AI "trả về" từ một mẫu, cho phép ghi đè từng field. */
function aiOutput(sample: Sample, override: Record<string, unknown> = {}) {
  return {
    type: sample.type,
    skill: sample.skill,
    level: LEVEL,
    topic: "Daily life",
    content: sample.content,
    answer: sample.answer,
    explanation: "Giải thích ngắn bằng tiếng Việt.",
    ...override,
  };
}

const schemaFor = (sample: Sample, extra: Partial<{ count: number }> = {}) =>
  buildGeneratedExerciseSchema({
    type: sample.type,
    skill: sample.skill,
    level: LEVEL,
    count: sample.count,
    ...extra,
  });

/** Gom path của mọi lỗi để kiểm đúng field bị báo. */
const issuePaths = (result: { success: boolean; error?: { issues: { path: unknown[] }[] } }) =>
  result.error?.issues.map((i) => i.path.join(".")) ?? [];

describe("buildGeneratedExerciseSchema", () => {
  it.each(SAMPLES.map((s) => [s.type, s] as const))("hợp lệ: %s", (_type, sample) => {
    const result = schemaFor(sample).safeParse(aiOutput(sample));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        type: sample.type,
        skill: sample.skill,
        level: LEVEL,
        topic: "Daily life",
        content: sample.content,
        answer: sample.answer,
        explanation: "Giải thích ngắn bằng tiếng Việt.",
      });
    }
  });

  it("field thừa (status/source/in_library) bị bỏ, không lọt ra kết quả", () => {
    const sample = bySample("fill_blank");
    const result = schemaFor(sample).safeParse(
      aiOutput(sample, { status: "PUBLISHED", source: "TEACHER", in_library: true })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(
        ["answer", "content", "explanation", "level", "skill", "topic", "type"].sort()
      );
    }
  });

  it.each([
    ["type", { type: "fill_blank" }],
    ["skill", { skill: Skill.SPEAKING }],
    ["level", { level: Level.B2 }],
  ])("lệch %s so với yêu cầu -> sai", (field, override) => {
    const sample = bySample("matching");
    const result = schemaFor(sample).safeParse(aiOutput(sample, override));
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain(field);
  });

  it.each([
    ["multiple_choice", "content.questions"],
    ["fill_blank", "content.text"],
    ["matching", "content.left"],
    ["listening_fill", "content.blanks"],
  ] as const)("lệch count (%s) -> sai ở %s", (type, path) => {
    const sample = bySample(type);
    const result = schemaFor(sample, { count: sample.count + 1 }).safeParse(aiOutput(sample));
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain(path);
  });

  it("writing/speaking: không kiểm count", () => {
    for (const type of ["writing", "speaking"] as const) {
      const sample = bySample(type);
      expect(schemaFor(sample, { count: 7 }).safeParse(aiOutput(sample)).success).toBe(true);
    }
  });

  it("content sai khuôn -> sai, path trỏ đúng field", () => {
    const sample = bySample("multiple_choice");
    const result = schemaFor(sample).safeParse(
      aiOutput(sample, { content: { questions: [{ q: "Only one option?", options: ["A"] }] } })
    );
    expect(result.success).toBe(false);
    expect(issuePaths(result).some((p) => p.startsWith("content"))).toBe(true);
  });

  it("answer lệch độ dài so với content -> sai (do validateExercise)", () => {
    const sample = bySample("listening_fill");
    const result = schemaFor(sample).safeParse(aiOutput(sample, { answer: ["market"] }));
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("answer");
  });

  it.each(
    SAMPLES.filter((s) => s.type !== "writing" && s.type !== "speaking").map(
      (s) => [s.type, s] as const
    )
  )("dạng cần answer, answer = null -> sai: %s", (_type, sample) => {
    const result = schemaFor(sample).safeParse(aiOutput(sample, { answer: null }));
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("answer");
  });

  it("dạng cần answer, thiếu hẳn field answer -> sai", () => {
    const sample = bySample("matching");
    const { answer: _omit, ...withoutAnswer } = aiOutput(sample);
    const result = schemaFor(sample).safeParse(withoutAnswer);
    expect(result.success).toBe(false);
  });

  it.each(["writing", "speaking"] as const)("%s có answer khác null -> ép về null", (type) => {
    const sample = bySample(type);
    const result = schemaFor(sample).safeParse(aiOutput(sample, { answer: ["unexpected"] }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.answer).toBeNull();
  });

  it("thiếu explanation hoặc topic rỗng -> sai", () => {
    const sample = bySample("fill_blank");
    expect(schemaFor(sample).safeParse(aiOutput(sample, { explanation: "  " })).success).toBe(false);
    expect(schemaFor(sample).safeParse(aiOutput(sample, { topic: "" })).success).toBe(false);
  });

  it("không phải object -> sai", () => {
    const sample = bySample("fill_blank");
    expect(schemaFor(sample).safeParse("not json object").success).toBe(false);
    expect(schemaFor(sample).safeParse(null).success).toBe(false);
  });
});