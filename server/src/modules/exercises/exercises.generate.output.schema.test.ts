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
    content: {
      script:
        "Anna wakes up at seven every morning and eats a small breakfast with her brother. At eight she goes to the ___ near her house, and she buys some ___ for lunch. Then she walks to school with her best friend and they talk about their homework.",
      blanks: 2,
    },
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


// ---------------------------------------------------------------------------
// T12 – kiểm riêng cho listening_fill (số ___ khớp blanks, độ dài script, độ dài đáp án)
// ---------------------------------------------------------------------------
describe("buildGeneratedExerciseSchema – listening_fill (T12)", () => {
  /** Script gồm `totalWords` từ, có `blanks` chỗ trống ___ (cách nhau, không đứng cạnh nhau). */
  const makeScript = (blanks: number, totalWords: number) => {
    const words = Array.from({ length: totalWords }, (_, i) => `word${i}`);
    for (let k = 0; k < blanks; k++) words[k * 2] = "___";
    return words.join(" ");
  };
  const makeAnswer = (n: number) => Array.from({ length: n }, (_, i) => `ans${i}`);

  const listening = bySample("listening_fill");
  const run = (
    o: { script?: string; blanks?: number; answer?: unknown; count?: number },
    base = { script: makeScript(2, 40), blanks: 2, answer: makeAnswer(2), count: 2 }
  ) => {
    const v = { ...base, ...o };
    return schemaFor(listening, { count: v.count }).safeParse(
      aiOutput(listening, { content: { script: v.script, blanks: v.blanks }, answer: v.answer })
    );
  };

  it("hợp lệ: N chỗ trống, blanks = N, answer.length = N", () => {
    const result = run({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("listening_fill");
      expect(result.data.answer).toEqual(makeAnswer(2));
    }
  });

  it.each([1, 10])("sát biên count = %i: hợp lệ", (n) => {
    expect(run({ script: makeScript(n, 60), blanks: n, answer: makeAnswer(n), count: n }).success).toBe(true);
  });

  it("số ___ trong script lệch blanks -> sai ở content.script (blanks, answer, count vẫn khớp nhau)", () => {
    const result = run({ script: makeScript(3, 40) });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("content.script");
  });

  it("blanks lệch answer.length -> sai ở answer (do T1)", () => {
    const result = run({ answer: makeAnswer(3) });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("answer");
  });

  it("blanks lệch count -> sai ở content.blanks", () => {
    const result = run({ count: 3 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("content.blanks");
  });

  it.each([
    ["rỗng", ""],
    ["chỉ khoảng trắng", "   "],
  ])("đáp án %s -> sai", (_label, value) => {
    const result = run({ answer: ["ok", value] });
    expect(result.success).toBe(false);
    expect(issuePaths(result).some((p) => p.startsWith("answer"))).toBe(true);
  });

  it("đáp án 31 ký tự -> sai ở answer.1; đúng 30 ký tự -> hợp lệ", () => {
    const tooLong = run({ answer: ["ok", "a".repeat(31)] });
    expect(tooLong.success).toBe(false);
    expect(issuePaths(tooLong)).toContain("answer.1");
    expect(run({ answer: ["ok", "a".repeat(30)] }).success).toBe(true);
  });

  it("đáp án 4 từ -> sai; đúng 3 từ -> hợp lệ", () => {
    const four = run({ answer: ["ok", "one two three four"] });
    expect(four.success).toBe(false);
    expect(issuePaths(four)).toContain("answer.1");
    expect(run({ answer: ["ok", "one two three"] }).success).toBe(true);
  });

  it.each([
    ["rỗng", ""],
    ["chỉ khoảng trắng", "   "],
    ["29 từ", makeScript(2, 29)],
    ["201 từ", makeScript(2, 201)],
  ])("script %s -> sai", (_label, script) => {
    const result = run({ script });
    expect(result.success).toBe(false);
    expect(issuePaths(result).some((p) => p.startsWith("content"))).toBe(true);
  });

  it.each([
    ["30 từ", 30],
    ["200 từ", 200],
  ])("script đúng biên %s -> hợp lệ", (_label, words) => {
    expect(run({ script: makeScript(2, words) }).success).toBe(true);
  });

  it("thông báo lỗi không chứa script hay đáp án thô", () => {
    const secretScript = makeScript(3, 40).replace("word5", "TOPSECRETWORD");
    const result = run({ script: secretScript, answer: ["SECRETANSWER", "x"] });
    expect(result.success).toBe(false);
    const text = JSON.stringify(result.error?.issues);
    expect(text).not.toContain("TOPSECRETWORD");
    expect(text).not.toContain("SECRETANSWER");
  });

  it("dạng khác không bị kiểm của Nghe (fill_blank ngắn, đáp án 4 từ vẫn hợp lệ)", () => {
    const fill = bySample("fill_blank");
    const result = schemaFor(fill).safeParse(
      aiOutput(fill, {
        content: { text: "She ___ to school." },
        answer: ["one two three four"],
      })
    );
    expect(result.success).toBe(true);
  });
});