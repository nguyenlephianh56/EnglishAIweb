import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Level, Skill } from "@prisma/client";

const fake = vi.hoisted(() => ({ createExercise: vi.fn() }));

// Không cần DB/.env: prisma giả (không có mẫu prompt trong DB -> dùng mẫu mặc định T10),
// còn createExercise để chứng minh hàm KHÔNG ghi bài vào DB.
vi.mock("../../config/prisma", () => ({
  prisma: {
    exercise: { create: fake.createExercise },
    promptTemplate: { findUnique: async () => null },
  },
}));
vi.mock("../../ai/ai.service.defaults", () => ({ getDefaultAiDeps: vi.fn() }));

import { DEFAULT_CACHEABLE_TASKS, InMemoryAiCache } from "../../ai/ai.cache";
import type { AiServiceDeps } from "../../ai/ai.service";
import { AIQuotaExceededError } from "../../ai/ai.types";
import { createPrismaUsageCounter, createPrismaUsageLogger } from "../../ai/ai.usage";
import type { AiUsageDb } from "../../ai/ai.usage";
import { AIInvalidFormatError } from "../../ai/json";
import type { AIProvider, AIRequest, AIResponse } from "../../ai/provider";
import type { ExerciseType } from "./exercise-content.schema";
import { generateExerciseDraft } from "./exercises.generate.service";
import type { GenerateExerciseDraftInput } from "./exercises.generate.service";

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
const TOPIC = "Daily life";
const EXPLANATION = "Giải thích ngắn bằng tiếng Việt.";
const MODEL = "mock-model";
const bySample = (type: ExerciseType) => SAMPLES.find((s) => s.type === type)!;

/** JSON thô mà AI "trả về" từ một mẫu, cho phép ghi đè từng field. */
function aiJson(sample: Sample, override: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: sample.type,
    skill: sample.skill,
    level: LEVEL,
    topic: "Daily life topic",
    content: sample.content,
    answer: sample.answer,
    explanation: EXPLANATION,
    ...override,
  });
}

const requestFor = (sample: Sample): GenerateExerciseDraftInput => ({
  userId: 1,
  role: "TEACHER",
  skill: sample.skill,
  level: LEVEL,
  topic: TOPIC,
  type: sample.type,
  count: sample.count,
});

// ---------------------------------------------------------------------
// Môi trường giả: provider theo kịch bản + DB log giả + đồng hồ cố định
// ---------------------------------------------------------------------
type Step = string | Error;

function setup(options: { steps?: Step[]; limits?: { student: number; teacher: number } } = {}) {
  const now = new Date("2026-11-14T03:00:00Z");

  const rows: { userId: number; task: string; status: string; tokens: number | null; createdAt: Date }[] = [];
  const db: AiUsageDb = {
    aiUsageLog: {
      async count({ where }) {
        return rows.filter(
          (r) =>
            r.userId === where.userId &&
            where.status.in.includes(r.status) &&
            r.createdAt >= where.createdAt.gte &&
            r.createdAt < where.createdAt.lt
        ).length;
      },
      async create({ data }) {
        rows.push({ ...data, createdAt: now });
        return data;
      },
    },
  };

  const steps = [...(options.steps ?? [])];
  const generate = vi.fn(async (_req: AIRequest): Promise<AIResponse> => {
    const step = steps.shift();
    if (step instanceof Error) throw step;
    if (step === undefined) throw new Error("Hết kịch bản provider giả");
    return { text: step, model: "mock-1", tokens: { input: 10, output: 5 } };
  });
  const provider: AIProvider = { name: "mock", generate };

  const deps: AiServiceDeps = {
    provider,
    cache: new InMemoryAiCache({ now: () => now.getTime() }),
    counter: createPrismaUsageCounter(db),
    logger: createPrismaUsageLogger(db),
    limits: options.limits ?? { student: 3, teacher: 5 },
    model: MODEL,
    cacheableTasks: new Set(DEFAULT_CACHEABLE_TASKS),
    now: () => now,
  };

  return { deps, generate, rows };
}

async function getError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Mong đợi lỗi nhưng lời gọi đã thành công");
}

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  consoleSpies = (["log", "info", "warn", "error"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {})
  );
});
afterEach(() => vi.restoreAllMocks());

const consoleText = () =>
  consoleSpies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" "))).join("\n");

const expected = (sample: Sample) => ({
  type: sample.type,
  skill: sample.skill,
  level: LEVEL,
  topic: "Daily life topic",
  content: sample.content,
  answer: sample.answer,
  explanation: EXPLANATION,
});

describe("generateExerciseDraft", () => {
  // -------------------------------------------------------------------
  // Hợp lệ
  // -------------------------------------------------------------------
  it.each(SAMPLES.map((s) => [s.type, s] as const))(
    "hợp lệ (%s): trả đúng object, gọi model 1 lần, log 1 dòng, không ghi DB bài",
    async (_type, sample) => {
      const t = setup({ steps: [aiJson(sample)] });
      const draft = await generateExerciseDraft(requestFor(sample), t.deps);

      expect(draft).toEqual(expected(sample));
      expect(t.generate).toHaveBeenCalledTimes(1);
      expect(t.rows).toHaveLength(1);
      expect(t.rows[0]).toMatchObject({ userId: 1, task: "generate", status: "ok" });
      expect(fake.createExercise).not.toHaveBeenCalled();
    }
  );

  it("prompt gửi cho model có type/count/level, topic nằm trong thẻ <topic>", async () => {
    const sample = bySample("matching");
    const t = setup({ steps: [aiJson(sample)] });
    await generateExerciseDraft(requestFor(sample), t.deps);

    const prompt = t.generate.mock.calls[0][0].prompt;
    expect(prompt).toContain("type: matching");
    expect(prompt).toContain("count: 3");
    expect(prompt).toContain("level: A2");
    expect(prompt).toMatch(/<topic>[\s\S]*Daily life[\s\S]*<\/topic>/);
  });

  it("task generate không được cache: gọi 2 lần cùng yêu cầu -> model bị gọi 2 lần", async () => {
    const sample = bySample("fill_blank");
    const t = setup({ steps: [aiJson(sample), aiJson(sample)] });
    await generateExerciseDraft(requestFor(sample), t.deps);
    await generateExerciseDraft(requestFor(sample), t.deps);

    expect(t.generate).toHaveBeenCalledTimes(2);
    expect(t.rows.map((r) => r.status)).toEqual(["ok", "ok"]);
  });

  // -------------------------------------------------------------------
  // Retry đúng 1 lần
  // -------------------------------------------------------------------
  it("lần 1 JSON hỏng, lần 2 hợp lệ -> thành công, đúng 2 lần gọi, 1 dòng log", async () => {
    const sample = bySample("fill_blank");
    const t = setup({ steps: ["đây không phải JSON", aiJson(sample)] });
    const draft = await generateExerciseDraft(requestFor(sample), t.deps);

    expect(draft).toEqual(expected(sample));
    expect(t.generate).toHaveBeenCalledTimes(2);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ task: "generate", status: "ok" });
  });

  it("lần 1 sai khuôn content, lần 2 hợp lệ -> thành công; lời nhắc retry không chứa nội dung sai", async () => {
    const sample = bySample("multiple_choice");
    const bad = aiJson(sample, {
      content: { questions: [{ q: "SECRET_BAD_CONTENT_123", options: ["only one"] }] },
    });
    const t = setup({ steps: [bad, aiJson(sample)] });
    const draft = await generateExerciseDraft(requestFor(sample), t.deps);

    expect(draft).toEqual(expected(sample));
    expect(t.generate).toHaveBeenCalledTimes(2);
    const retryPrompt = t.generate.mock.calls[1][0].prompt;
    expect(retryPrompt).toContain("Lần trước phản hồi sai định dạng");
    expect(retryPrompt).toContain("content");
    expect(retryPrompt).not.toContain("SECRET_BAD_CONTENT_123");
  });

  it("lần 1 sai answer (lệch số chỗ trống), lần 2 hợp lệ -> thành công", async () => {
    const sample = bySample("listening_fill");
    const t = setup({ steps: [aiJson(sample, { answer: ["market"] }), aiJson(sample)] });
    const draft = await generateExerciseDraft(requestFor(sample), t.deps);

    expect(draft).toEqual(expected(sample));
    expect(t.generate).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------
  // Lệch yêu cầu: type / skill / level / count
  // -------------------------------------------------------------------
  const MISMATCHES: [string, Record<string, unknown>][] = [
    ["type", { type: "fill_blank" }],
    ["skill", { skill: Skill.SPEAKING }],
    ["level", { level: Level.B2 }],
  ];

  it.each(MISMATCHES)("lệch %s ở lần 1 -> retry, lần 2 đúng -> thành công (2 lần gọi)", async (_f, override) => {
    const sample = bySample("matching");
    const t = setup({ steps: [aiJson(sample, override), aiJson(sample)] });
    const draft = await generateExerciseDraft(requestFor(sample), t.deps);

    expect(draft).toEqual(expected(sample));
    expect(t.generate).toHaveBeenCalledTimes(2);
  });

  it("lệch count ở lần 1 (yêu cầu 3 cặp, AI trả 2 cặp) -> retry rồi thành công", async () => {
    const sample = bySample("matching");
    const twoPairs = aiJson(sample, {
      content: { left: ["big", "happy"], right: ["quick", "glad"] },
      answer: [
        [0, 0],
        [1, 1],
      ],
    });
    const t = setup({ steps: [twoPairs, aiJson(sample)] });
    const draft = await generateExerciseDraft(requestFor(sample), t.deps);

    expect(draft).toEqual(expected(sample));
    expect(t.generate).toHaveBeenCalledTimes(2);
  });

  it.each(MISMATCHES)("lệch %s cả 2 lần -> AI_INVALID_FORMAT, đúng 2 lần gọi, log error", async (_f, override) => {
    const sample = bySample("matching");
    const bad = aiJson(sample, override);
    const t = setup({ steps: [bad, bad] });
    const error = await getError(generateExerciseDraft(requestFor(sample), t.deps));

    expect(error).toBeInstanceOf(AIInvalidFormatError);
    expect((error as AIInvalidFormatError).code).toBe("AI_INVALID_FORMAT");
    expect(t.generate).toHaveBeenCalledTimes(2);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ task: "generate", status: "error" });
    expect(fake.createExercise).not.toHaveBeenCalled();
  });

  it("lệch count cả 2 lần -> AI_INVALID_FORMAT, đúng 2 lần gọi", async () => {
    const sample = bySample("fill_blank");
    const twoBlanks = aiJson(sample, {
      content: { text: "I ___ and you ___ here." },
      answer: ["am", "are"],
    });
    const t = setup({ steps: [twoBlanks, twoBlanks] });
    const error = await getError(generateExerciseDraft(requestFor(sample), t.deps));

    expect(error).toBeInstanceOf(AIInvalidFormatError);
    expect(t.generate).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------
  // answer
  // -------------------------------------------------------------------
  it.each(
    SAMPLES.filter((s) => s.type !== "writing" && s.type !== "speaking").map(
      (s) => [s.type, s] as const
    )
  )("dạng cần answer (%s) mà answer = null cả 2 lần -> AI_INVALID_FORMAT", async (_type, sample) => {
    const bad = aiJson(sample, { answer: null });
    const t = setup({ steps: [bad, bad] });
    const error = await getError(generateExerciseDraft(requestFor(sample), t.deps));

    expect(error).toBeInstanceOf(AIInvalidFormatError);
    expect(t.generate).toHaveBeenCalledTimes(2);
  });

  it("dạng cần answer mà thiếu hẳn field answer ở lần 1 -> retry", async () => {
    const sample = bySample("fill_blank");
    const { answer: _omit, ...withoutAnswer } = JSON.parse(aiJson(sample));
    const t = setup({ steps: [JSON.stringify(withoutAnswer), aiJson(sample)] });
    const draft = await generateExerciseDraft(requestFor(sample), t.deps);

    expect(draft).toEqual(expected(sample));
    expect(t.generate).toHaveBeenCalledTimes(2);
  });

  it.each(["writing", "speaking"] as const)(
    "%s mà AI trả answer khác null -> ép về null, không tốn retry (1 lần gọi)",
    async (type) => {
      const sample = bySample(type);
      const t = setup({ steps: [aiJson(sample, { answer: ["unexpected"] })] });
      const draft = await generateExerciseDraft(requestFor(sample), t.deps);

      expect(draft.answer).toBeNull();
      expect(t.generate).toHaveBeenCalledTimes(1);
    }
  );

  // -------------------------------------------------------------------
  // Field thừa
  // -------------------------------------------------------------------
  it("field thừa status/source/in_library từ AI không có trong kết quả", async () => {
    const sample = bySample("fill_blank");
    const t = setup({
      steps: [aiJson(sample, { status: "PUBLISHED", source: "TEACHER", in_library: true })],
    });
    const draft = await generateExerciseDraft(requestFor(sample), t.deps);

    expect(Object.keys(draft).sort()).toEqual(
      ["answer", "content", "explanation", "level", "skill", "topic", "type"].sort()
    );
    expect(draft).not.toHaveProperty("status");
    expect(draft).not.toHaveProperty("source");
    expect(draft).not.toHaveProperty("in_library");
  });

  // -------------------------------------------------------------------
  // Hết lượt ngày
  // -------------------------------------------------------------------
  it("hết lượt/ngày -> AI_QUOTA_EXCEEDED, provider không được gọi, không ghi bài", async () => {
    const sample = bySample("fill_blank");
    const t = setup({ steps: [aiJson(sample)], limits: { student: 0, teacher: 0 } });
    const error = await getError(generateExerciseDraft(requestFor(sample), t.deps));

    expect(error).toBeInstanceOf(AIQuotaExceededError);
    expect((error as AIQuotaExceededError).code).toBe("AI_QUOTA_EXCEEDED");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ task: "generate", status: "rate_limited" });
    expect(fake.createExercise).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Không rò nội dung ra log
  // -------------------------------------------------------------------
  it("không log prompt, chủ đề, nội dung bài hay phản hồi thô (kể cả khi thất bại)", async () => {
    const sample = bySample("fill_blank");
    const bad = aiJson(sample, { content: { text: "LEAKED_RAW_CONTENT_999 no blank" } });
    const t = setup({ steps: [bad, bad] });
    await getError(
      generateExerciseDraft({ ...requestFor(sample), topic: "LEAKED_TOPIC_777" }, t.deps)
    );

    const logs = consoleText();
    expect(logs).not.toContain("LEAKED_RAW_CONTENT_999");
    expect(logs).not.toContain("LEAKED_TOPIC_777");
    expect(logs).not.toContain("You are an experienced English teacher");
  });
});