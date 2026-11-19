import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  LEVEL_THRESHOLDS,
  LOWEST_LEVEL,
  PROFILE_SCORE_MAX,
  PROFILE_SCORE_MIN,
  type ProfileLevel,
} from "../../src/modules/skill-profiles/skill-profiles.constants";

const requiredText = (field: string) => z.string({
  required_error: `thiếu ${field}`,
  invalid_type_error: `${field} phải là chuỗi`,
}).trim().min(1, `${field} không được rỗng`);

const scoreMessage = `manual_score phải là số hữu hạn từ ${PROFILE_SCORE_MIN} đến ${PROFILE_SCORE_MAX}`;
const sampleSchema = z.object({
  id: requiredText("id"),
  prompt: requiredText("prompt"),
  level: z.custom<ProfileLevel>(
    (value) => value === LOWEST_LEVEL || LEVEL_THRESHOLDS.some(({ level }) => level === value),
    "level phải là mức CEFR của đề (A1, A2, B1 hoặc B2)",
  ),
  // T13 nhận minWords từ 0 đến 100000, với 0 khi đề không quy định.
  minWords: z.number({ invalid_type_error: "minWords phải là số" })
    .int("minWords phải là số nguyên")
    .min(0, "minWords phải từ 0 đến 100000")
    .max(100000, "minWords phải từ 0 đến 100000")
    .default(0),
  text: requiredText("text"),
  manual_score: z.number({ required_error: "thiếu manual_score", invalid_type_error: scoreMessage })
    .finite(scoreMessage)
    .min(PROFILE_SCORE_MIN, scoreMessage)
    .max(PROFILE_SCORE_MAX, scoreMessage),
}, { invalid_type_error: "mẫu phải là object JSON" });

export type WritingSample = z.infer<typeof sampleSchema>;

export interface WritingSamples {
  samples: WritingSample[];
  rejected: Array<{ row: number; reason: string }>;
}

export class WritingSamplesError extends Error {}

export function validateWritingSamples(input: unknown): WritingSamples {
  if (!Array.isArray(input)) {
    throw new WritingSamplesError("Bộ mẫu JSON phải là một mảng, mỗi phần tử là một mẫu.");
  }

  const samples: WritingSample[] = [];
  const rejected: WritingSamples["rejected"] = [];
  const seenIds = new Set<string>();

  for (const [index, item] of input.entries()) {
    const row = index + 1;
    const result = sampleSchema.safeParse(item);
    if (!result.success) {
      const reasons = new Set(result.error.issues.map((issue) => issue.message));
      rejected.push({ row, reason: [...reasons].join(", ") });
      continue;
    }

    const sample = result.data;
    if (seenIds.has(sample.id)) {
      rejected.push({ row, reason: "id trùng với một mẫu hợp lệ trước đó" });
      continue;
    }

    seenIds.add(sample.id);
    samples.push(sample);
  }

  return { samples, rejected };
}

export async function readWritingSamples(path: string): Promise<WritingSamples> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new WritingSamplesError(`Thiếu file bộ mẫu chấm tay ở ${path}.`);
    }
    throw new WritingSamplesError(`Không đọc được file bộ mẫu ở ${path}.`);
  }

  let input: unknown;
  try {
    input = JSON.parse(contents.replace(/^\uFEFF/, ""));
  } catch {
    throw new WritingSamplesError(`File bộ mẫu ở ${path} không phải JSON hợp lệ.`);
  }

  return validateWritingSamples(input);
}