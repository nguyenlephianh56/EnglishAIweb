import { describe, expect, it } from "vitest";
import {
  LEVEL_THRESHOLDS,
  LOWEST_LEVEL,
} from "../../src/modules/skill-profiles/skill-profiles.constants";
import { calculateWritingMetrics, writingScoreToLevel } from "./metrics";

describe("calculateWritingMetrics", () => {
  it("trả MAE bằng 0, bias bằng 0, r bằng 1 và 100% cùng mức khi điểm giống nhau", () => {
    const pairs = [2, 4, 6, 8].map((score) => ({ ai_score: score, manual_score: score }));

    expect(calculateWritingMetrics(pairs)).toEqual({
      n: 4,
      mae: 0,
      bias: 0,
      pearsonR: 1,
      sameLevelRate: 1,
      oneLevelOffRate: 0,
      moreThanOneLevelOffRate: 0,
    });
  });

  it("trả bias +1 và MAE 1 khi AI luôn chấm cao hơn 1 điểm", () => {
    const pairs = [1, 4, 7].map((score) => ({ ai_score: score + 1, manual_score: score }));

    expect(calculateWritingMetrics(pairs)).toMatchObject({ n: 3, mae: 1, bias: 1 });
  });

  it("trả r bằng -1 khi điểm đảo ngược tuyến tính", () => {
    const pairs = [2, 4, 6, 8].map((score) => ({ ai_score: 10 - score, manual_score: score }));

    expect(calculateWritingMetrics(pairs).pearsonR).toBe(-1);
  });

  it("trả r null khi một trong hai dãy điểm có phương sai bằng 0", () => {
    const scores = [2, 4, 6];
    const constantAi = scores.map((score) => ({ ai_score: 0.1, manual_score: score }));
    const constantManual = scores.map((score) => ({ ai_score: score, manual_score: 0.1 }));

    expect(calculateWritingMetrics(constantAi).pearsonR).toBeNull();
    expect(calculateWritingMetrics(constantManual).pearsonR).toBeNull();
  });

  it("trả null cho các chỉ số khi n = 0", () => {
    expect(calculateWritingMetrics([])).toEqual({
      n: 0,
      mae: null,
      bias: null,
      pearsonR: null,
      sameLevelRate: null,
      oneLevelOffRate: null,
      moreThanOneLevelOffRate: null,
    });
  });

  it("tính chênh lệch và mức khi n = 1, trả r null", () => {
    expect(calculateWritingMetrics([{ ai_score: 6, manual_score: 2 }])).toEqual({
      n: 1,
      mae: 4,
      bias: 4,
      pearsonR: null,
      sameLevelRate: 0,
      oneLevelOffRate: 0,
      moreThanOneLevelOffRate: 1,
    });
  });

  it("khớp phép tính tay với 5 mẫu và đủ ba nhóm chênh mức", () => {
    const metrics = calculateWritingMetrics([
      { ai_score: 6, manual_score: 2 },
      { ai_score: 4, manual_score: 4 },
      { ai_score: 5, manual_score: 6 },
      { ai_score: 9, manual_score: 8 },
      { ai_score: 3, manual_score: 9 },
    ]);

    expect(metrics).toMatchObject({
      n: 5,
      mae: 12 / 5,
      bias: -2 / 5,
      sameLevelRate: 2 / 5,
      oneLevelOffRate: 1 / 5,
      moreThanOneLevelOffRate: 2 / 5,
    });
    // n = 5, tổng AI = 27, tổng tay = 29, tổng tích = 157, tổng bình phương = 167 và 201.
    expect(metrics.pearsonR).toBeCloseTo(2 / Math.sqrt(106 * 164), 12);
  });

  it("chỉ tính cặp đủ hai điểm hợp lệ, gồm cả điểm 0", () => {
    expect(calculateWritingMetrics([
      { ai_score: 0, manual_score: 0 },
      { ai_score: null, manual_score: 4 },
      { ai_score: 4 },
      { ai_score: NaN, manual_score: 4 },
      { ai_score: 4, manual_score: Infinity },
      { ai_score: -0.1, manual_score: 4 },
      { ai_score: 4, manual_score: 10.1 },
    ])).toMatchObject({ n: 1, mae: 0, bias: 0, sameLevelRate: 1 });
  });

  it("giữ nguyên độ chính xác khi tính chênh lệch và quy đổi mức", () => {
    const metrics = calculateWritingMetrics([{ ai_score: 3.999, manual_score: 4 }]);

    expect(metrics.mae).toBeCloseTo(0.001, 12);
    expect(metrics.bias).toBeCloseTo(-0.001, 12);
    expect(metrics.oneLevelOffRate).toBe(1);
  });

  it("tính được r khi các độ lệch rất nhỏ vẫn khác nhau", () => {
    const pairs = [0, Number.MIN_VALUE, 2 * Number.MIN_VALUE].map((score) => ({
      ai_score: score,
      manual_score: score,
    }));

    expect(calculateWritingMetrics(pairs).pearsonR).toBe(1);
  });
});

describe("writingScoreToLevel", () => {
  it.each(LEVEL_THRESHOLDS.map(({ min, level }, index) => ({
    min,
    level,
    lowerLevel: LEVEL_THRESHOLDS[index + 1]?.level ?? LOWEST_LEVEL,
  })))("xếp đúng mức ngay dưới ngưỡng và tại ngưỡng $min", ({ min, level, lowerLevel }) => {
    expect(writingScoreToLevel(min - 0.01)).toBe(lowerLevel);
    expect(writingScoreToLevel(min)).toBe(level);
  });

  it("xếp A1 và B1 vào nhóm lệch hơn 1 mức, A2 và B1 vào nhóm lệch đúng 1 mức", () => {
    expect(calculateWritingMetrics([{ ai_score: 2, manual_score: 6 }]))
      .toMatchObject({ oneLevelOffRate: 0, moreThanOneLevelOffRate: 1 });
    expect(calculateWritingMetrics([{ ai_score: 4, manual_score: 6 }]))
      .toMatchObject({ oneLevelOffRate: 1, moreThanOneLevelOffRate: 0 });
  });
});