import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLiveEvaluation, runWritingEvaluation } from "./grading";
import { calculateWritingMetrics } from "./metrics";
import type { WritingSample } from "./samples";

const live = vi.hoisted(() => ({ findUnique: vi.fn(), disconnect: vi.fn(), gradeWriting: vi.fn() }));
vi.mock("../../src/config/env", () => ({
  env: { WRITING_MAX_WORDS: 600, WRITING_MAX_CHARS: 4000, GEMINI_API_KEY: "MOCK_KEY" },
}));
vi.mock("../../src/config/prisma", () => ({
  prisma: { user: { findUnique: live.findUnique }, $disconnect: live.disconnect },
}));
vi.mock("../../src/ai/writingGrader", () => ({ gradeWriting: live.gradeWriting }));
vi.mock("../../src/ai/gemini.provider", () => { throw new Error("Không nạp Gemini thật trong test."); });

const criteria = { content: 6, coherence: 7, vocabulary: 8, grammar: 8 };
const graded = { criteria, comment: "MOCK_RAW_FEEDBACK", errors: [] };
const sample = (id: string, overrides: Partial<WritingSample> = {}): WritingSample => ({
  id, prompt: "MOCK_PROMPT", text: "MOCK_TEXT", level: "A2", minWords: 0, manual_score: 6,
  ...overrides,
});
const aiError = (code: string) => Object.assign(new Error("MOCK_RAW_RESPONSE"), { code });

let directory: string;
let checkpointPath: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ai-eval-grading-"));
  checkpointPath = join(directory, "out", "checkpoint.json");
});
afterEach(async () => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

const options = () => ({ checkpointPath, limits: { maxWords: 600, maxChars: 4000 }, delayMs: 0, refresh: false });

describe("runWritingEvaluation", () => {
  it("lọc độ dài, chạy tuần tự có đợi, và loại lỗi AI khỏi chỉ số", async () => {
    const order: string[] = [];
    const grade = vi.fn(async ({ id }: WritingSample) => {
      order.push(id);
      if (id === "invalid") throw aiError("AI_INVALID_FORMAT");
      if (id === "timeout") throw aiError("TIMEOUT");
      if (id === "offline") throw aiError("AI_UNAVAILABLE");
      return graded;
    });
    const wait = vi.fn(async () => { order.push("wait"); });
    const result = await runWritingEvaluation([
      sample("short", { text: "Placeholder", minWords: 2 }),
      sample("long", { text: "x".repeat(30_001) }),
      sample("ok"), sample("invalid"), sample("timeout"), sample("offline"), sample("last"),
    ], { ...options(), grade, wait, delayMs: 100 });

    expect(order).toEqual(["ok", "wait", "invalid", "wait", "timeout", "wait", "offline", "wait", "last"]);
    expect(wait).toHaveBeenCalledWith(100);
    expect(result.scored.map(({ ai_score }) => ai_score)).toEqual([7.25, 7.25]);
    expect(calculateWritingMetrics(result.scored).n).toBe(2);
    expect(result.rejectedLength).toEqual([
      { id: "short", code: "WRITING_TOO_SHORT" }, { id: "long", code: "WRITING_TOO_LONG" },
    ]);
    expect(result.aiErrors.map(({ code }) => code)).toEqual(["AI_INVALID_FORMAT", "TIMEOUT", "AI_UNAVAILABLE"]);
    const saved = await readFile(checkpointPath, "utf8");
    expect(JSON.parse(saved)).toEqual([
      { id: "ok", ai_score: 7.25, criteria },
      { id: "invalid", error_code: "AI_INVALID_FORMAT" },
      { id: "timeout", error_code: "TIMEOUT" },
      { id: "offline", error_code: "AI_UNAVAILABLE" },
      { id: "last", ai_score: 7.25, criteria },
    ]);
    expect(saved).not.toContain("MOCK_");
  });

  it.each(["RATE_LIMITED", "AI_QUOTA_EXCEEDED"])("giữ điểm khi dừng do %s và tiếp tục ở lần sau", async (code) => {
    const samples = [sample("saved"), sample("blocked"), sample("later")];
    const grade = vi.fn().mockResolvedValueOnce(graded).mockRejectedValueOnce(aiError(code));
    const stopped = await runWritingEvaluation(samples, { ...options(), grade });

    expect(stopped).toMatchObject({ stoppedBy: code, pending: 2, reused: 0, aiErrors: [] });
    expect(grade.mock.calls.map(([input]) => input.id)).toEqual(["saved", "blocked"]);
    expect(JSON.parse(await readFile(checkpointPath, "utf8"))).toEqual([
      { id: "saved", ai_score: 7.25, criteria }, { id: "blocked", error_code: code },
    ]);

    const resume = vi.fn().mockResolvedValue(graded);
    const resumed = await runWritingEvaluation(samples, { ...options(), grade: resume });
    expect(resumed).toMatchObject({ reused: 1, pending: 0, stoppedBy: null });
    expect(resumed.scored).toHaveLength(3);
    expect(resume.mock.calls.map(([input]) => input.id)).toEqual(["blocked", "later"]);

    resume.mockClear();
    await runWritingEvaluation(samples, { ...options(), grade: resume });
    expect(resume).not.toHaveBeenCalled();

    await runWritingEvaluation(samples, { ...options(), grade: resume, refresh: true });
    expect(resume.mock.calls.map(([input]) => input.id)).toEqual(["saved", "blocked", "later"]);
  });

  it("không dùng lại điểm cũ nếu refresh của mẫu đó trả lỗi", async () => {
    const samples = [sample("one")];
    await runWritingEvaluation(samples, { ...options(), grade: vi.fn().mockResolvedValue(graded) });
    const failed = await runWritingEvaluation(samples, {
      ...options(), refresh: true, grade: vi.fn().mockRejectedValue(aiError("TIMEOUT")),
    });
    expect(failed.scored).toEqual([]);
    const retry = vi.fn().mockResolvedValue(graded);
    await runWritingEvaluation(samples, { ...options(), grade: retry });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("dừng trước khi gọi grader nếu checkpoint hỏng hoặc đang có khóa", async () => {
    const grade = vi.fn();
    await runWritingEvaluation([sample("one")], { ...options(), grade: vi.fn().mockResolvedValue(graded) });
    await writeFile(`${checkpointPath}.lock`, "");
    await expect(runWritingEvaluation([sample("one")], { ...options(), grade })).rejects.toThrow("Đã có khóa");
    await rm(`${checkpointPath}.lock`);
    await writeFile(checkpointPath, "NỘI DUNG RIÊNG TƯ");
    await expect(runWritingEvaluation([sample("one")], { ...options(), grade })).rejects.toThrow("không hợp lệ");
    expect(grade).not.toHaveBeenCalled();
  });
});

describe("runLiveEvaluation với cổng giả", () => {
  it("kiểm tra giáo viên ACTIVE, gọi đúng hàm T13 và giữ counter/logger khi refresh", async () => {
    vi.stubEnv("AI_EVAL_USER_ID", "42");
    vi.stubEnv("AI_EVAL_DELAY_MS", "0");
    live.findUnique.mockResolvedValue({ role: "TEACHER", status: "ACTIVE" });
    live.gradeWriting.mockResolvedValue(graded);
    const input = sample("one");

    await runLiveEvaluation([input], checkpointPath, true);
    expect(live.findUnique).toHaveBeenCalledWith({ where: { id: 42 }, select: { role: true, status: true } });
    expect(live.gradeWriting).toHaveBeenCalledWith({
      userId: 42, role: "TEACHER", prompt: input.prompt, text: input.text, level: input.level, minWords: input.minWords,
    }, { ai: { cacheableTasks: new Set() } });
    expect(live.disconnect).toHaveBeenCalledOnce();
  });

  it("dừng nếu tài khoản đánh giá không phải giáo viên ACTIVE", async () => {
    vi.stubEnv("AI_EVAL_USER_ID", "42");
    vi.stubEnv("AI_EVAL_DELAY_MS", "0");
    live.findUnique.mockResolvedValue({ role: "STUDENT", status: "ACTIVE" });

    await expect(runLiveEvaluation([sample("one")], checkpointPath, false)).rejects.toThrow("TEACHER đang ACTIVE");
    expect(live.gradeWriting).not.toHaveBeenCalled();
    expect(live.disconnect).toHaveBeenCalledOnce();
  });
});