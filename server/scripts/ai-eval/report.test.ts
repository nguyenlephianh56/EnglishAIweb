import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvaluationResult } from "./grading";
import { runCli } from "./index";
import { renderWritingReports, writeWritingReports } from "./report";
import type { WritingSample } from "./samples";

const mockRun = vi.hoisted(() => vi.fn());
vi.mock("./grading", () => ({ EvaluationError: class extends Error {}, runLiveEvaluation: mockRun }));

const sample = (id: string, manual_score: number): WritingSample => ({
  id, manual_score, level: "A2", minWords: 0, text: "MOCK_TEXT", prompt: "MOCK_PROMPT",
});
const evaluation = (overrides: Partial<EvaluationResult> = {}): EvaluationResult => ({
  scored: [], aiErrors: [], rejectedLength: [], reused: 0, pending: 0, stoppedBy: null, ...overrides,
});

describe("renderWritingReports", () => {
  it("xuất chỉ số tính tay, số mẫu bị loại, và CSV theo thứ tự bộ mẫu", () => {
    const scored = [
      { id: "W01", manual_score: 2, ai_score: 6 },
      { id: 'W,"02"', manual_score: 4, ai_score: 4 },
      { id: "W03", manual_score: 6, ai_score: 5 },
      { id: "W04", manual_score: 8, ai_score: 9 },
      { id: "W05", manual_score: 9, ai_score: 3 },
    ];
    const samples = scored.map(({ id, manual_score }) => sample(id, manual_score));
    samples.push(sample("=W06", 7), sample("W07", 4));
    const { markdown, csv } = renderWritingReports(samples, 2, evaluation({
      scored: [...scored].reverse(),
      aiErrors: [{ id: "=W06", code: "TIMEOUT" }],
      rejectedLength: [{ id: "W07", code: "WRITING_TOO_SHORT" }],
    }));

    for (const row of [
      "| Số cặp điểm dùng để tính (n) | 5 |", "| MAE (điểm) | 2.40 |", "| Bias (điểm) | -0.40 |",
      "| Pearson r | 0.02 |", "| Cùng mức | 40.00% |", "| Lệch đúng 1 mức | 20.00% |",
      "| **Lệch hơn 1 mức** | **40.00%** |", "| Mẫu bỏ qua khi đọc JSON | 2 |",
      "| Mẫu bị từ chối do độ dài | 1 |", "| Mẫu lỗi AI | 1 |", "| Mẫu còn chờ chấm | 0 |", "**Hạn chế.**",
    ]) expect(markdown).toContain(row);
    expect(csv).toBe("\uFEFF" + [
      "id,manual_score,ai_score,difference,manual_level,ai_level",
      "W01,2.00,6.00,4.00,A1,B1",
      '"W,""02""",4.00,4.00,0.00,A2,A2',
      "W03,6.00,5.00,-1.00,B1,A2",
      "W04,8.00,9.00,1.00,B2,B2",
      "W05,9.00,3.00,-6.00,B2,A1",
      "'=W06,7.00,,,B1,",
      "W07,4.00,,,A2,",
      "",
    ].join("\r\n"));
    expect(markdown + csv).not.toContain("MOCK_");
  });

  it("hiện chỉ số chưa xác định và đánh dấu kết quả tạm thời khi n bằng 0", () => {
    const { markdown, csv } = renderWritingReports([sample("W01", 0)], 0, evaluation({
      stoppedBy: "AI_QUOTA_EXCEEDED", pending: 1,
    }));
    expect(markdown).toContain("| Số cặp điểm dùng để tính (n) | 0 |");
    expect(markdown).toContain("| Pearson r | — |");
    expect(markdown).toContain("| **Lệch hơn 1 mức** | **—** |");
    expect(markdown).toContain("**Kết quả tạm thời.** Lượt chấm dừng do `AI_QUOTA_EXCEEDED`.");
    expect(csv).toContain("W01,0.00,,,A1,");
  });
});

describe("CLI xuất báo cáo", () => {
  let directory: string;
  let samplesPath: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "ai-eval-report-"));
    samplesPath = join(directory, "writing-samples.json");
    await writeFile(samplesPath, JSON.stringify([sample("W01", 2), sample("W02", 4)]));
  });
  afterEach(async () => {
    mockRun.mockReset();
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it("ghi cả hai file trước khi trả mã dừng do hạn mức", async () => {
    const result = evaluation({
      scored: [{ id: "W01", manual_score: 2, ai_score: 6 }], stoppedBy: "RATE_LIMITED", pending: 1,
    });
    mockRun.mockImplementation(async (_samples, _checkpoint, _refresh, onResult) => {
      await onResult(result);
      return result;
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runCli([], samplesPath)).toBe(2);
    const out = join(directory, "out");
    const markdown = await readFile(join(out, "writing-summary.md"), "utf8");
    const csv = await readFile(join(out, "writing-details.csv"), "utf8");
    expect(markdown).toContain("| Mẫu còn chờ chấm | 1 |");
    expect(markdown).toContain("**100.00%**");
    expect(csv).toContain("W02,4.00,,,A2,");
    expect(log.mock.calls.flat().join("\n")).not.toContain("MOCK_");
  });

  it("dry-run không chấm và không tạo thư mục báo cáo", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await runCli(["--dry-run"], samplesPath)).toBe(0);
    expect(mockRun).not.toHaveBeenCalled();
    await expect(access(join(directory, "out"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("giữ khóa lúc xuất và tiếp tục đợt refresh bằng điểm mới", async () => {
    const { runWritingEvaluation } = await vi.importActual<typeof import("./grading")>("./grading");
    const out = join(directory, "out");
    const samples = [sample("W01", 2), sample("W02", 4), sample("W03", 6)];
    const grade = vi.fn(async () => ({ criteria: { content: 7, coherence: 7, vocabulary: 7, grammar: 7 } }));
    const options = {
      checkpointPath: join(out, "checkpoint.json"), limits: { maxWords: 600, maxChars: 4000 },
      delayMs: 0, refresh: false, grade,
    };
    await runWritingEvaluation(samples, options);

    const block = Object.assign(new Error("MOCK_RESPONSE"), { code: "AI_QUOTA_EXCEEDED" });
    const freshGrade = vi.fn().mockResolvedValueOnce({
      criteria: { content: 8, coherence: 8, vocabulary: 8, grammar: 8 },
    }).mockRejectedValueOnce(block);
    await runWritingEvaluation(samples, {
      ...options, refresh: true, grade: freshGrade,
      onResult: async (result) => {
        await expect(runWritingEvaluation(samples, options)).rejects.toThrow("Đã có khóa");
        await writeWritingReports(out, samples, 0, result);
      },
    });
    expect(await readFile(join(out, "writing-details.csv"), "utf8")).toContain("W03,6.00,,,B1,");

    grade.mockClear();
    const resumed = await runWritingEvaluation(samples, options);
    expect(resumed.reused).toBe(1);
    expect(resumed.scored[0]).toMatchObject({ id: "W01", ai_score: 8 });
    expect(grade).toHaveBeenCalledTimes(2);
  });
});