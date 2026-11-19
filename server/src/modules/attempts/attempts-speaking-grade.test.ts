import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIQuotaExceededError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { toGradingError } from "./attempts-grading-error";

// Test thuần (KHÔNG DB, KHÔNG AI thật): ghi điểm + ai_feedback + errors cho attempt speaking.
const { gradeSpeakingMock, db } = vi.hoisted(() => ({
  gradeSpeakingMock: vi.fn(),
  db: {
    attempt: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  },
}));
vi.mock("../../ai/speakingGrader", () => ({ gradeSpeaking: gradeSpeakingMock }));
vi.mock("../../config/prisma", () => ({ prisma: db }));

import { gradeSpeakingAttempt } from "./attempts-speaking-grade";

const CONTENT = { prompt: "Talk about your day." };
const ERRORS = [
  { type: "pronunciation", text: "thirty", correction: "thirty", explanation: "Phát âm /θ/ chưa rõ." },
];
const GRADED = {
  score: 7.33,
  criteria: { content: 8, fluency: 7, pronunciation: 7 },
  wordIssues: [{ word: "thirty", issue: "Phát âm /θ/ chưa rõ." }],
  comment: "Bạn nói khá tốt.",
  errors: ERRORS,
};
const clientTranscript = { text: "I get up at six", source: "client" as const };
const target = (transcript: unknown = clientTranscript) => ({
  attemptId: 42,
  userId: 7,
  content: CONTENT,
  transcript: transcript as never,
});

beforeEach(() => {
  vi.clearAllMocks();
  gradeSpeakingMock.mockResolvedValue(GRADED);
  db.attempt.updateMany.mockResolvedValue({ count: 1 });
});

describe("gradeSpeakingAttempt - ghi kết quả", () => {
  it("ghi score, ai_feedback {criteria, comment, wordIssues}, errors; chỉ khi score IS NULL", async () => {
    const r = await gradeSpeakingAttempt(target());

    expect(db.attempt.updateMany).toHaveBeenCalledTimes(1);
    expect(db.attempt.updateMany).toHaveBeenCalledWith({
      where: { id: 42, score: null },
      data: {
        score: 7.33,
        aiFeedback: {
          criteria: GRADED.criteria,
          comment: GRADED.comment,
          wordIssues: GRADED.wordIssues,
        },
        errors: ERRORS,
      },
    });
    expect(r).toEqual({
      written: true,
      score: 7.33,
      errors: ERRORS,
      aiFeedback: { criteria: GRADED.criteria, comment: GRADED.comment, wordIssues: GRADED.wordIssues },
    });
  });

  it("ai_feedback KHÔNG chứa transcript/text/audio dù kết quả chấm có field thừa", async () => {
    gradeSpeakingMock.mockResolvedValue({ ...GRADED, transcript: "SECRET TEXT", audio_id: "x" });
    await gradeSpeakingAttempt(target());
    const data = db.attempt.updateMany.mock.calls[0][0].data;
    expect(Object.keys(data.aiFeedback).sort()).toEqual(["comment", "criteria", "wordIssues"]);
    expect(JSON.stringify(data)).not.toContain("SECRET TEXT");
  });

  it("truyền cho gradeSpeaking đúng studentId, đề và nguyên bản chữ (kèm usageLogId để gộp log)", async () => {
    const t = { text: "I get up at six", source: "gemini" as const, usageLogId: 55 };
    await gradeSpeakingAttempt(target(t));
    expect(gradeSpeakingMock).toHaveBeenCalledExactlyOnceWith({
      studentId: 7,
      content: CONTENT,
      transcript: t,
    });
  });

  it("đã có lần chấm khác ghi trước (count 0): KHÔNG ghi đè, trả dữ liệu đang lưu, written=false", async () => {
    db.attempt.updateMany.mockResolvedValue({ count: 0 });
    db.attempt.findUniqueOrThrow.mockResolvedValue({
      score: 9, errors: [], aiFeedback: { criteria: { content: 9, fluency: 9, pronunciation: 9 }, comment: "c", wordIssues: [] },
    });
    const r = await gradeSpeakingAttempt(target());
    expect(r.written).toBe(false);
    expect(r.score).toBe(9);
  });
});

describe("gradeSpeakingAttempt - lỗi AI: ném nguyên vẹn, KHÔNG ghi gì", () => {
  it.each([
    ["hết lượt/ngày", new AIQuotaExceededError(), "AI_QUOTA_EXCEEDED"],
    ["429", new AIServiceError("RATE_LIMITED", 1), "RATE_LIMITED"],
    ["timeout", new AIServiceError("TIMEOUT", 1), "TIMEOUT"],
    ["không dùng được", new AIServiceError("AI_UNAVAILABLE", 1), "AI_UNAVAILABLE"],
    ["JSON sai", new AIInvalidFormatError(2), "AI_INVALID_FORMAT"],
  ])("%s", async (_n, err, code) => {
    gradeSpeakingMock.mockRejectedValue(err);
    await expect(gradeSpeakingAttempt(target())).rejects.toBe(err);
    expect(db.attempt.updateMany).not.toHaveBeenCalled();
    // Mã chuẩn hóa mà service trả cho HS (202 gradingError).
    expect(toGradingError(err)?.code).toBe(code);
  });

  it("lỗi không phải AI (DB...) thì toGradingError trả null để service ném lại như cũ", async () => {
    expect(toGradingError(new Error("DB down"))).toBeNull();
  });
});