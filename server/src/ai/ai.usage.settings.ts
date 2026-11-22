import { z } from "zod";
import { prisma } from "../config/prisma";
import type { AiDailyLimits } from "./ai.usage";
import { dailyLimitsFromEnv } from "./ai.usage.config";

export const AI_DAILY_LIMITS_KEY = "settings:ai_daily_limits";
export const AI_DAILY_LIMIT_MAX = 1000;
export const AI_DAILY_LIMITS_CACHE_TTL_MS = 30_000;

const dailyLimit = z.number().int().min(1).max(AI_DAILY_LIMIT_MAX);
export const aiDailyLimitsSchema = z.object({ student: dailyLimit, teacher: dailyLimit }).strict();

type AiDailyLimitsRow = { template: string; updatedAt: Date };
const limitsSelect = { template: true, updatedAt: true } as const;

interface AiDailyLimitsDb {
  promptTemplate: {
    findUnique(args: { where: { key: string }; select: typeof limitsSelect }): Promise<AiDailyLimitsRow | null>;
  };
}

export type AiDailyLimitsConfig = Readonly<AiDailyLimits & {
  source: "db" | "env";
  updated_at: string | null;
}>;

function parseStoredLimits(template: string): AiDailyLimits | undefined {
  try {
    const result = aiDailyLimitsSchema.safeParse(JSON.parse(template));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function dailyLimitsConfigFromRow(row: AiDailyLimitsRow | null): AiDailyLimitsConfig {
  if (row !== null) {
    const limits = parseStoredLimits(row.template);
    if (limits !== undefined) {
      return { ...limits, source: "db", updated_at: row.updatedAt.toISOString() };
    }
  }

  console.warn("AI_LIMITS_CONFIG_INVALID");
  return { ...dailyLimitsFromEnv(), source: "env", updated_at: null };
}

export function createAiDailyLimitsReader(db: AiDailyLimitsDb, now: () => number = () => performance.now()) {
  let cache: { expiresAt: number; value: Promise<AiDailyLimitsConfig> } | undefined;

  async function getAiDailyLimitsConfig() {
    const readAt = now();
    if (cache && readAt < cache.expiresAt) return cache.value;

    // Lưu promise ngay để các lượt đọc đồng thời dùng chung một truy vấn.
    const entry = {
      expiresAt: readAt + AI_DAILY_LIMITS_CACHE_TTL_MS,
      value: db.promptTemplate.findUnique({
        where: { key: AI_DAILY_LIMITS_KEY }, select: limitsSelect,
      }).then(dailyLimitsConfigFromRow),
    };
    cache = entry;
    try {
      return await entry.value;
    } catch (error) {
      if (cache === entry) cache = undefined;
      throw error;
    }
  }

  function invalidateAiDailyLimitsCache() {
    cache = undefined;
  }

  return { getAiDailyLimitsConfig, invalidateAiDailyLimitsCache };
}

export const { getAiDailyLimitsConfig, invalidateAiDailyLimitsCache } = createAiDailyLimitsReader(prisma);