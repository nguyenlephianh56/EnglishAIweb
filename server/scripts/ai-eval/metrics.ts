import {
  LEVEL_THRESHOLDS,
  LOWEST_LEVEL,
  type ProfileLevel,
} from "../../src/modules/skill-profiles/skill-profiles.constants";
import { scoreToLevel } from "../../src/modules/skill-profiles/skill-profiles.level";

export interface WritingScorePair {
  ai_score?: number | null;
  manual_score?: number | null;
}

export interface WritingMetrics {
  n: number;
  mae: number | null;
  bias: number | null;
  pearsonR: number | null;
  // Các tỷ lệ nằm trong [0, 1]. Đổi sang phần trăm khi xuất báo cáo.
  sameLevelRate: number | null;
  oneLevelOffRate: number | null;
  moreThanOneLevelOffRate: number | null;
}

const levels = [...LEVEL_THRESHOLDS.map(({ level }) => level), LOWEST_LEVEL];

export function writingScoreToLevel(score: number): ProfileLevel | null {
  return scoreToLevel(score, 1, { minSamples: 1 });
}

function centeredScores(scores: readonly number[]): number[] | null {
  // Dịch theo điểm đầu tiên để dãy điểm bằng nhau có độ lệch đúng bằng 0.
  const offsets = scores.map((score) => score - scores[0]);
  const scale = offsets.reduce((max, offset) => Math.max(max, Math.abs(offset)), 0);
  if (scale === 0) return null;

  // Đổi thang đo trước khi bình phương để giữ được các chênh lệch rất nhỏ.
  const scaled = offsets.map((offset) => offset / scale);
  const mean = scaled.reduce((sum, offset) => sum + offset, 0) / scaled.length;
  return scaled.map((offset) => offset - mean);
}

function pearsonCorrelation(aiScores: readonly number[], manualScores: readonly number[]): number | null {
  if (aiScores.length < 2) return null;

  const aiCentered = centeredScores(aiScores);
  const manualCentered = centeredScores(manualScores);
  if (aiCentered === null || manualCentered === null) return null;

  let crossProducts = 0;
  let aiSquares = 0;
  let manualSquares = 0;
  for (let i = 0; i < aiCentered.length; i++) {
    const ai = aiCentered[i];
    const manual = manualCentered[i];
    crossProducts += ai * manual;
    aiSquares += ai * ai;
    manualSquares += manual * manual;
  }

  const r = crossProducts / Math.sqrt(aiSquares * manualSquares);
  // Sai số số thực có thể làm r vượt nhẹ ra ngoài [-1, 1].
  return Math.max(-1, Math.min(1, r));
}

export function calculateWritingMetrics(pairs: readonly WritingScorePair[]): WritingMetrics {
  const aiScores: number[] = [];
  const manualScores: number[] = [];
  let absoluteDifferenceSum = 0;
  let differenceSum = 0;
  let sameLevel = 0;
  let oneLevelOff = 0;

  for (const { ai_score, manual_score } of pairs) {
    if (typeof ai_score !== "number" || typeof manual_score !== "number") continue;

    const aiLevel = writingScoreToLevel(ai_score);
    const manualLevel = writingScoreToLevel(manual_score);
    if (aiLevel === null || manualLevel === null) continue;

    aiScores.push(ai_score);
    manualScores.push(manual_score);
    const difference = ai_score - manual_score;
    absoluteDifferenceSum += Math.abs(difference);
    differenceSum += difference;

    const levelGap = Math.abs(levels.indexOf(aiLevel) - levels.indexOf(manualLevel));
    if (levelGap === 0) sameLevel++;
    if (levelGap === 1) oneLevelOff++;
  }

  const n = aiScores.length;
  if (n === 0) {
    return {
      n,
      mae: null,
      bias: null,
      pearsonR: null,
      sameLevelRate: null,
      oneLevelOffRate: null,
      moreThanOneLevelOffRate: null,
    };
  }

  return {
    n,
    mae: absoluteDifferenceSum / n,
    bias: differenceSum / n,
    pearsonR: pearsonCorrelation(aiScores, manualScores),
    sameLevelRate: sameLevel / n,
    oneLevelOffRate: oneLevelOff / n,
    moreThanOneLevelOffRate: (n - sameLevel - oneLevelOff) / n,
  };
}