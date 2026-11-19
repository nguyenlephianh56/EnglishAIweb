import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvaluationResult } from "./grading";
import { calculateWritingMetrics, writingScoreToLevel } from "./metrics";
import type { WritingSample } from "./samples";

export const SUMMARY_FILE = "writing-summary.md";
export const DETAILS_FILE = "writing-details.csv";
export class WritingReportError extends Error {}

const decimal = (value: number): string => {
  const formatted = value.toFixed(2);
  return formatted === "-0.00" ? "0.00" : formatted;
};
const metric = (value: number | null): string => value === null ? "—" : decimal(value);
const percent = (value: number | null): string => value === null ? "—" : `${decimal(value * 100)}%`;

function csvId(id: string): string {
  // Dấu nháy giữ ID bắt đầu giống công thức ở dạng văn bản trong bảng tính.
  const safeId = /^[=+\-@\t\r\n]/.test(id) ? `'${id}` : id;
  return /[",\r\n]/.test(safeId) ? `"${safeId.replace(/"/g, '""')}"` : safeId;
}

export function renderWritingReports(
  samples: readonly Pick<WritingSample, "id" | "manual_score">[],
  invalidCount: number,
  result: EvaluationResult,
): { markdown: string; csv: string } {
  const numbers = calculateWritingMetrics(result.scored);
  const markdown = [
    "### Độ tin cậy của AI khi chấm Viết",
    "",
    "| Chỉ số | Kết quả |",
    "| --- | ---: |",
    `| Số cặp điểm dùng để tính (n) | ${numbers.n} |`,
    `| MAE (điểm) | ${metric(numbers.mae)} |`,
    `| Bias (điểm) | ${metric(numbers.bias)} |`,
    `| Pearson r | ${metric(numbers.pearsonR)} |`,
    `| Cùng mức | ${percent(numbers.sameLevelRate)} |`,
    `| Lệch đúng 1 mức | ${percent(numbers.oneLevelOffRate)} |`,
    `| **Lệch hơn 1 mức** | **${percent(numbers.moreThanOneLevelOffRate)}** |`,
    `| Mẫu bỏ qua khi đọc JSON | ${invalidCount} |`,
    `| Mẫu bị từ chối do độ dài | ${result.rejectedLength.length} |`,
    `| Mẫu lỗi AI | ${result.aiErrors.length} |`,
    `| Mẫu còn chờ chấm | ${result.pending} |`,
    "",
    "Bias tính theo điểm AI trừ điểm chấm tay. Dấu — biểu thị chỉ số chưa xác định.",
  ];
  if (result.stoppedBy) {
    markdown.push("", `**Kết quả tạm thời.** Lượt chấm dừng do \`${result.stoppedBy}\`.`);
  }
  markdown.push(
    "",
    "**Hạn chế.** Cỡ mẫu nhỏ, chỉ có một người chấm tay và mức quy đổi theo điểm chưa xét độ khó của đề. Kết quả phản ánh một đợt đánh giá với một model và một mẫu prompt chấm Viết.",
    "",
  );

  const scoresById = new Map(result.scored.map(({ id, ai_score }) => [id, ai_score] as const));
  const rows = ["id,manual_score,ai_score,difference,manual_level,ai_level"];
  for (const { id, manual_score } of samples) {
    const aiScore = scoresById.get(id);
    rows.push([
      csvId(id),
      decimal(manual_score),
      aiScore === undefined ? "" : decimal(aiScore),
      aiScore === undefined ? "" : decimal(aiScore - manual_score),
      writingScoreToLevel(manual_score) ?? "",
      aiScore === undefined ? "" : (writingScoreToLevel(aiScore) ?? ""),
    ].join(","));
  }
  return { markdown: markdown.join("\n"), csv: `\uFEFF${rows.join("\r\n")}\r\n` };
}

export async function writeWritingReports(
  outputDir: string,
  samples: readonly WritingSample[],
  invalidCount: number,
  result: EvaluationResult,
): Promise<void> {
  const { markdown, csv } = renderWritingReports(samples, invalidCount, result);
  try {
    await mkdir(outputDir, { recursive: true });
    const temporaryDir = await mkdtemp(join(outputDir, ".writing-reports-"));
    try {
      const markdownPath = join(temporaryDir, SUMMARY_FILE);
      const csvPath = join(temporaryDir, DETAILS_FILE);
      await writeFile(markdownPath, markdown, "utf8");
      await writeFile(csvPath, csv, "utf8");
      await rename(csvPath, join(outputDir, DETAILS_FILE));
      await rename(markdownPath, join(outputDir, SUMMARY_FILE));
    } finally {
      await rm(temporaryDir, { recursive: true, force: true });
    }
  } catch {
    throw new WritingReportError(`Không xuất được báo cáo ở ${outputDir}. Điểm đã lưu có thể dùng để chạy lại.`);
  }
}