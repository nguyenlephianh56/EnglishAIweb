import type { Skill } from "@prisma/client";
import {
  PROFILE_SCORE_MAX,
  PROFILE_SCORE_MIN,
  type ProfileLevel,
} from "../skill-profiles/skill-profiles.constants";
import { PROFILE_SKILL_ORDER } from "../skill-profiles/skill-profiles.schema";

export const TOP_ERROR_LIMIT = 10;
const ERROR_TYPE_PATTERN = /^[a-z0-9_]+(?::[a-z0-9_]+)?$/;

export interface AnalysisProfileRow {
  skill: Skill;
  score: number | null;
  level: ProfileLevel | null;
  errorStats: unknown;
}

interface StudentSkillStats {
  score: number;
  level: ProfileLevel | null;
}

interface ClassSkillStats {
  average_score: number;
  students_with_data: number;
  level_distribution: Record<ProfileLevel | "unassigned", number>;
}

interface CommonStats {
  top_errors: { type: string; count: number }[];
  limited_data: boolean;
}

type SkillStats<T> = Record<Skill, T | null>;

export interface StudentAnalysisStats extends CommonStats {
  skills: SkillStats<StudentSkillStats>;
}

export interface ClassAnalysisStats extends CommonStats {
  skills: SkillStats<ClassSkillStats>;
}

function mapSkills<T>(getStats: (skill: Skill) => T | null): SkillStats<T> {
  return Object.fromEntries(
    PROFILE_SKILL_ORDER.map((skill) => [skill, getStats(skill)]),
  ) as SkillStats<T>;
}

function addErrorCounts(counts: Map<string, bigint>, value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;

  for (const [type, count] of Object.entries(value)) {
    if (
      ERROR_TYPE_PATTERN.test(type) &&
      typeof count === "number" && Number.isInteger(count) && count >= 0
    ) {
      counts.set(type, (counts.get(type) ?? 0n) + BigInt(count));
    }
  }
}

function summarizeClassSkill(rows: readonly StudentSkillStats[]): ClassSkillStats {
  const level_distribution = { A1: 0, A2: 0, B1: 0, B2: 0, unassigned: 0 };
  for (const { level } of rows) {
    level_distribution[level ?? "unassigned"] += 1;
  }

  // Cộng theo thứ tự cố định để kết quả không phụ thuộc thứ tự các dòng trả về từ DB.
  const scores = rows.map(({ score }) => score).sort((a, b) => a - b);
  const total = scores.reduce((sum, score) => {
    const scaled = score * 100;
    const rounded = Math.round(scaled);
    // T14 lưu điểm đến 2 chữ số. Cộng điểm này bằng số nguyên để giữ đúng biên làm tròn.
    return sum + (rounded / 100 === score ? rounded : scaled);
  }, 0);
  const average_score = Math.round(total / scores.length) / 100;
  return { average_score, students_with_data: scores.length, level_distribution };
}

export function aggregateAnalysisStats(
  scope: "student", rows: readonly AnalysisProfileRow[],
): StudentAnalysisStats;
export function aggregateAnalysisStats(
  scope: "class", rows: readonly AnalysisProfileRow[],
): ClassAnalysisStats;
export function aggregateAnalysisStats(
  scope: "student" | "class", rows: readonly AnalysisProfileRow[],
): StudentAnalysisStats | ClassAnalysisStats;
export function aggregateAnalysisStats(
  scope: "student" | "class", rows: readonly AnalysisProfileRow[],
): StudentAnalysisStats | ClassAnalysisStats {
  const bySkill = new Map<Skill, StudentSkillStats[]>();
  const errorCounts = new Map<string, bigint>();
  let hasAssignedLevel = false;

  for (const { skill, score, level, errorStats } of rows) {
    addErrorCounts(errorCounts, errorStats);
    if (
      score === null || !Number.isFinite(score) ||
      score < PROFILE_SCORE_MIN || score > PROFILE_SCORE_MAX
    ) continue;

    const scoredRows = bySkill.get(skill) ?? [];
    scoredRows.push({ score, level });
    bySkill.set(skill, scoredRows);
    hasAssignedLevel ||= level !== null;
  }

  const top_errors = [...errorCounts]
    .sort(([leftType, leftCount], [rightType, rightCount]) => {
      if (leftCount !== rightCount) return leftCount > rightCount ? -1 : 1;
      if (leftType === rightType) return 0;
      return leftType < rightType ? -1 : 1;
    })
    .slice(0, TOP_ERROR_LIMIT)
    // Tổng lỗi vẫn hữu hạn trong JSON nếu dữ liệu cũ chứa các số đếm cực lớn.
    .map(([type, count]) => ({ type, count: Math.min(Number(count), Number.MAX_VALUE) }));
  const common = { top_errors, limited_data: bySkill.size > 0 && !hasAssignedLevel };

  if (scope === "student") {
    return { skills: mapSkills((skill) => bySkill.get(skill)?.[0] ?? null), ...common };
  }

  return {
    skills: mapSkills((skill) => {
      const scoredRows = bySkill.get(skill);
      return scoredRows ? summarizeClassSkill(scoredRows) : null;
    }),
    ...common,
  };
}