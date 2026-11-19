import { describe, expect, it, vi } from "vitest";
import { SPEAKING_TRANSCRIPT_MAX_CHARS } from "../../ai/speaking.constants";
import { AIServiceError } from "../../ai/resilience";
import { SpeakingTranscriptError, type SpeakingTranscriptResult } from "../../ai/speakingTranscript";
import { prepareSpeakingAttempt } from "./attempts-speaking-submit";

// Test thuần (KHÔNG DB, KHÔNG AI thật): bước chuẩn bị trước khi lưu attempt speaking.
// Mock prisma chỉ để việc import chuỗi ai.usage -> prisma không cần kết nối DB.
vi.mock("../../config/prisma", () => ({ prisma: {} }));

const AUDIO_ID = "3f2b8c1e-9d4a-4b6f-8a1c-0e5d7f9a2b3c";
const CONTENT = { prompt: "Talk about your day.", sample: "I get up at six." };
const STUDENT = 7;

const fake = (result: SpeakingTranscriptResult | Error) =>
  vi.fn(async (input: { studentId: number; audio_id?: unknown; transcript?: unknown }) => {
    void input;
    if (result instanceof Error) throw result;
    return result;
  });

const run = (answer: unknown, getTranscript: ReturnType<typeof fake>, content: unknown = CONTENT) =>
  prepareSpeakingAttempt(STUDENT, content, answer, {
    getTranscript: getTranscript as unknown as typeof import("../../ai/speakingTranscript").getSpeakingTranscript,
  });

const expectError = async (p: Promise<unknown>, statusCode: number, code: string) => {
  await expect(p).rejects.toMatchObject({ statusCode, code });
};

describe("prepareSpeakingAttempt - đường transcript", () => {
  it("trả { text } đã trim, score NULL, max_score 10, errors rỗng; không có audio_id", async () => {
    const get = fake({ text: "I get up at six", source: "client" });
    const r = await run({ transcript: "  I get up at six  " }, get);

    expect(r.answer).toEqual({ text: "I get up at six" });
    expect(r.score).toBeNull();
    expect(r.maxScore).toBe(10);
    expect(r.errors).toEqual([]);
    expect(r.speakingTranscript).toEqual({ text: "I get up at six", source: "client" });
    expect(JSON.stringify(r)).not.toContain("audio_id");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toEqual({ studentId: STUDENT, transcript: "I get up at six" });
  });
});

describe("prepareSpeakingAttempt - đường audio_id", () => {
  it("gọi lấy bản chữ với đúng studentId của HS, lưu chỉ { text }, giữ usageLogId để chấm gộp log", async () => {
    const get = fake({ text: "I get up at six", source: "gemini", usageLogId: 55 });
    const r = await run({ audio_id: AUDIO_ID }, get);

    expect(get.mock.calls[0][0]).toEqual({ studentId: STUDENT, audio_id: AUDIO_ID });
    expect(r.answer).toEqual({ text: "I get up at six" });
    expect(r.speakingTranscript).toEqual({ text: "I get up at six", source: "gemini", usageLogId: 55 });
    expect(JSON.stringify(r.answer)).not.toContain(AUDIO_ID);
  });

  it("bản chữ Gemini dưới 3 từ -> 422 TRANSCRIPT_TOO_SHORT", async () => {
    await expectError(run({ audio_id: AUDIO_ID }, fake({ text: "Hello there", source: "gemini" })), 422, "TRANSCRIPT_TOO_SHORT");
  });

  it("bản chữ Gemini quá dài -> 422 TRANSCRIPT_TOO_LONG", async () => {
    const text = Array(SPEAKING_TRANSCRIPT_MAX_CHARS).fill("go").join(" ");
    await expectError(run({ audio_id: AUDIO_ID }, fake({ text, source: "gemini" })), 422, "TRANSCRIPT_TOO_LONG");
  });

  it.each([
    ["file không thấy / của HS khác", new SpeakingTranscriptError(404, "AUDIO_NOT_FOUND", "x"), 404, "AUDIO_NOT_FOUND"],
    ["Gemini 429", new AIServiceError("RATE_LIMITED", 1), 429, "RATE_LIMITED"],
    ["Gemini timeout", new AIServiceError("TIMEOUT", 1), 504, "TIMEOUT"],
    ["Gemini không dùng được", new AIServiceError("AI_UNAVAILABLE", 1), 502, "AI_UNAVAILABLE"],
  ])("lỗi chữ hóa (%s) ném nguyên vẹn", async (_n, err, status, code) => {
    await expectError(run({ audio_id: AUDIO_ID }, fake(err as Error)), status as number, code as string);
  });
});

describe("prepareSpeakingAttempt - đầu vào sai bị chặn TRƯỚC khi lấy bản chữ", () => {
  it.each([
    ["cả hai nguồn", { audio_id: AUDIO_ID, transcript: "I get up at six" }],
    ["không có nguồn nào", {}],
    ["field lạ", { transcript: "I get up at six", score: 10 }],
    ["dạng lưu { text }", { text: "I get up at six" }],
    ["transcript rỗng", { transcript: "   " }],
    ["transcript quá dài", { transcript: "a".repeat(SPEAKING_TRANSCRIPT_MAX_CHARS + 1) }],
    ["audio_id sai định dạng", { audio_id: "abc" }],
    ["answer không phải object", "I get up at six"],
  ])("%s -> 400 VALIDATION_ERROR, không gọi lấy bản chữ", async (_n, answer) => {
    const get = fake({ text: "I get up at six", source: "client" });
    await expectError(run(answer, get), 400, "VALIDATION_ERROR");
    expect(get).not.toHaveBeenCalled();
  });

  it("transcript dưới 3 từ -> 422 TRANSCRIPT_TOO_SHORT (nguồn FE, không gọi AI)", async () => {
    await expectError(run({ transcript: "hi there" }, fake({ text: "hi there", source: "client" })), 422, "TRANSCRIPT_TOO_SHORT");
  });

  it("đề hỏng -> 422 EXERCISE_CONTENT_INVALID, không gọi lấy bản chữ", async () => {
    const get = fake({ text: "I get up at six", source: "client" });
    await expectError(run({ audio_id: AUDIO_ID }, get, { sample: "no prompt" }), 422, "EXERCISE_CONTENT_INVALID");
    expect(get).not.toHaveBeenCalled();
  });

  it("thông báo lỗi không chép lại nội dung HS gửi", async () => {
    const secret = "my-private-sentence-xyz";
    const err = await run({ transcript: secret, score: 9 }, fake({ text: secret, source: "client" })).catch((e) => e);
    expect(String(err.message)).not.toContain(secret);
  });
});