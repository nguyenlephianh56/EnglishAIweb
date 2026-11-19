import { dirname, resolve } from "node:path";
import { EvaluationError, runLiveEvaluation } from "./grading";
import { DETAILS_FILE, SUMMARY_FILE, writeWritingReports, WritingReportError } from "./report";
import { readWritingSamples, WritingSamplesError } from "./samples";

const defaultSamplesPath = resolve("data/ai-eval/writing-samples.json");

export async function runCli(args: readonly string[], samplesPath = defaultSamplesPath): Promise<number> {
  const mode = args[0];
  if (args.length > 1 || (mode !== undefined && mode !== "--dry-run" && mode !== "--refresh")) {
    console.error("Dùng npm.cmd run eval:ai với tùy chọn -- --dry-run hoặc -- --refresh.");
    return 1;
  }

  try {
    const { samples, rejected } = await readWritingSamples(samplesPath);
    console.log(`Mẫu hợp lệ ${samples.length}. Mẫu bỏ qua ${rejected.length}.`);
    for (const { row, reason } of rejected) {
      console.log(`Mẫu số ${row} bị bỏ qua (${reason}).`);
    }
    if (samples.length === 0) {
      console.log("Không có mẫu hợp lệ trong bộ mẫu.");
      return 0;
    }
    if (mode === "--dry-run") return 0;

    const outputDir = resolve(dirname(samplesPath), "out");
    const result = await runLiveEvaluation(
      samples,
      resolve(outputDir, "checkpoint.json"),
      mode === "--refresh",
      (evaluation) => writeWritingReports(outputDir, samples, rejected.length, evaluation),
    );
    console.log(`Đã xuất ${SUMMARY_FILE} và ${DETAILS_FILE} vào ${outputDir}.`);
    console.log(`Có điểm ${result.scored.length} (dùng lại ${result.reused}). Bị từ chối do độ dài ${result.rejectedLength.length}. Lỗi AI ${result.aiErrors.length}. Còn chờ ${result.pending}.`);
    if (result.stoppedBy) {
      console.log(`Đã dừng do ${result.stoppedBy}. Còn ${result.pending} mẫu cần chấm.`);
      return 2;
    }
    return 0;
  } catch (error) {
    if (
      error instanceof WritingSamplesError ||
      error instanceof EvaluationError ||
      error instanceof WritingReportError
    ) {
      console.error(error.message);
    } else {
      console.error("Không hoàn tất được đánh giá. Hãy kiểm tra cấu hình cơ sở dữ liệu và AI.");
    }
    return 1;
  }
}

if (typeof require !== "undefined" && require.main === module) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}