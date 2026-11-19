import { describe, expect, it } from "vitest";
import { buildAttemptResult } from "./attempt-result";

// Test thuần: buildAttemptResult hiển thị kết quả bài Nói; writing không đổi.
const exercise = {
  id: 1, type: "speaking", skill: "SPEAKING", level: "A2", topic: "t",
  content: { prompt: "Talk" }, answer: null, explanation: "Giải thích",
};
const base = { id: 9, score: 7.33, maxScore: 10, teacherScore: null };
const speakingFb = {
  criteria: { content: 8, fluency: 7, pronunciation: 7 },
  comment: "Bạn nói khá tốt.",
  wordIssues: [{ word: "thirty", issue: "x" }],
};
const errors = [{ type: "pronunciation", text: "thirty", correction: "thirty", explanation: "Phát âm /θ/ chưa rõ." }];

describe("buildAttemptResult - speaking", () => {
  it("trả criteria 3 tiêu chí + comment; không có `answer`; wordIssues không lọt ra riêng", () => {
    const r = buildAttemptResult({ ...base, errors, aiFeedback: speakingFb }, exercise, { reveal: true });
    expect(r.criteria).toEqual({ content: 8, fluency: 7, pronunciation: 7 });
    expect(r.comment).toBe("Bạn nói khá tốt.");
    expect(r).not.toHaveProperty("answer");
    expect(r).not.toHaveProperty("wordIssues");
    expect(r.errors).toEqual(errors);
    expect(r.score).toBe(7.33);
    expect(r.graded).toBe(true);
  });

  it("bài giao chưa quá hạn (reveal=false): vẫn có criteria/comment, ẩn correction/explanation của errors và explanation", () => {
    const r = buildAttemptResult({ ...base, errors, aiFeedback: speakingFb }, exercise, { reveal: false });
    expect(r.criteria).toEqual({ content: 8, fluency: 7, pronunciation: 7 });
    expect(r.comment).toBeDefined();
    expect(r).not.toHaveProperty("explanation");
    expect(r).not.toHaveProperty("answer");
    for (const e of r.errors) {
      expect(e).not.toHaveProperty("correction");
      expect(e).not.toHaveProperty("explanation");
    }
  });

  it("chờ chấm (score NULL, ai_feedback NULL): graded=false, không có criteria/comment", () => {
    const r = buildAttemptResult({ ...base, score: null, errors: [], aiFeedback: null }, exercise, { reveal: false });
    expect(r.score).toBeNull();
    expect(r.graded).toBe(false);
    expect(r).not.toHaveProperty("criteria");
    expect(r).not.toHaveProperty("comment");
  });

  it("criteria Nói thiếu/hỏng một tiêu chí thì bỏ cả criteria, giữ comment", () => {
    const r = buildAttemptResult(
      { ...base, errors: [], aiFeedback: { criteria: { content: 8, fluency: "x", pronunciation: 7 }, comment: "ok" } },
      exercise, { reveal: false }
    );
    expect(r).not.toHaveProperty("criteria");
    expect(r.comment).toBe("ok");
  });

  it("key lạ trong ai_feedback (transcript, audio_id...) không lọt ra response", () => {
    const r = buildAttemptResult(
      { ...base, errors: [], aiFeedback: { ...speakingFb, transcript: "SECRET", audio_id: "a" } },
      exercise, { reveal: true }
    );
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(JSON.stringify(r)).not.toContain("audio_id");
  });
});

describe("buildAttemptResult - writing không đổi", () => {
  it("vẫn trả criteria 4 tiêu chí", () => {
    const r = buildAttemptResult(
      { ...base, errors: [], aiFeedback: { criteria: { content: 8, coherence: 7, vocabulary: 6, grammar: 5 }, comment: "ok" } },
      { ...exercise, type: "writing", skill: "WRITING" }, { reveal: false }
    );
    expect(r.criteria).toEqual({ content: 8, coherence: 7, vocabulary: 6, grammar: 5 });
  });

  it("criteria writing thiếu grammar thì bỏ (không bị nhầm sang Nói)", () => {
    const r = buildAttemptResult(
      { ...base, errors: [], aiFeedback: { criteria: { content: 8, coherence: 7, vocabulary: 6 } } },
      exercise, { reveal: false }
    );
    expect(r).not.toHaveProperty("criteria");
  });
});