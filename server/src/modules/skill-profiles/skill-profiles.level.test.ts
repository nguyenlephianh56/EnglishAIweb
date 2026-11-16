import { describe, it, expect } from "vitest";
import { scoreToLevel } from "./skill-profiles.level";
import { calcProfileScore, selectScores } from "./skill-profiles.score";
import {
  LEVEL_THRESHOLDS,
  LOWEST_LEVEL,
  MIN_SAMPLES,
  type LevelThreshold,
} from "./skill-profiles.constants";

const ENOUGH = MIN_SAMPLES; // đủ mẫu

describe("hằng số mặc định", () => {
  it("MIN_SAMPLES = 3; bảng ngưỡng 8/6/4; mức thấp nhất A1", () => {
    expect(MIN_SAMPLES).toBe(3);
    expect(LEVEL_THRESHOLDS.map((t) => [t.level, t.min])).toEqual([
      ["B2", 8],
      ["B1", 6],
      ["A2", 4],
    ]);
    expect(LOWEST_LEVEL).toBe("A1");
  });
});

describe("scoreToLevel: ngưỡng và biên", () => {
  it.each([
    [0, "A1"],
    [3.99, "A1"],
    [4.0, "A2"], // biên thuộc mức CAO hơn
    [5.99, "A2"],
    [6.0, "B1"],
    [7.99, "B1"],
    [8.0, "B2"],
    [10, "B2"],
  ])("điểm %s -> %s", (score, expected) => {
    expect(scoreToLevel(score, ENOUGH)).toBe(expected);
  });

  it("sát biên kiểu số thực: 3.9999999 -> A1, 4.0000001 -> A2, 7.9999999 -> B1", () => {
    expect(scoreToLevel(3.9999999, ENOUGH)).toBe("A1");
    expect(scoreToLevel(4.0000001, ENOUGH)).toBe("A2");
    expect(scoreToLevel(7.9999999, ENOUGH)).toBe("B1");
  });
});

describe("scoreToLevel: đủ dữ liệu", () => {
  it("sampleCount = MIN_SAMPLES-1 -> null; = MIN_SAMPLES -> có mức", () => {
    expect(scoreToLevel(9, MIN_SAMPLES - 1)).toBeNull();
    expect(scoreToLevel(9, MIN_SAMPLES)).toBe("B2");
    expect(scoreToLevel(9, MIN_SAMPLES + 5)).toBe("B2");
  });

  it("0 mẫu hoặc sampleCount hỏng (âm, NaN) -> null", () => {
    expect(scoreToLevel(9, 0)).toBeNull();
    expect(scoreToLevel(9, -1)).toBeNull();
    expect(scoreToLevel(9, NaN)).toBeNull();
  });
});

describe("scoreToLevel: score không dùng được -> null", () => {
  it("null, undefined, NaN, Infinity, ngoài [0, 10]", () => {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity, -0.01, 10.01]) {
      expect(scoreToLevel(bad, ENOUGH)).toBeNull();
    }
  });
});

describe("scoreToLevel: đổi cấu hình thì kết quả đổi theo", () => {
  it("đổi MIN_SAMPLES", () => {
    expect(scoreToLevel(7, 4, { minSamples: 5 })).toBeNull();
    expect(scoreToLevel(7, 5, { minSamples: 5 })).toBe("B1");
    expect(scoreToLevel(7, 1, { minSamples: 1 })).toBe("B1");
  });

  it("đổi ngưỡng", () => {
    const strict: LevelThreshold[] = [
      { level: "B2", min: 9 },
      { level: "B1", min: 7 },
      { level: "A2", min: 5 },
    ];
    expect(scoreToLevel(8, ENOUGH)).toBe("B2");
    expect(scoreToLevel(8, ENOUGH, { thresholds: strict })).toBe("B1");
    expect(scoreToLevel(4.5, ENOUGH, { thresholds: strict })).toBe("A1");
  });

  it("bảng ngưỡng không sắp sẵn vẫn đúng và không bị sửa", () => {
    const shuffled: LevelThreshold[] = [
      { level: "A2", min: 4 },
      { level: "B2", min: 8 },
      { level: "B1", min: 6 },
    ];
    const copy = shuffled.map((t) => ({ ...t }));
    expect(scoreToLevel(8, ENOUGH, { thresholds: shuffled })).toBe("B2");
    expect(scoreToLevel(6, ENOUGH, { thresholds: shuffled })).toBe("B1");
    expect(scoreToLevel(1, ENOUGH, { thresholds: shuffled })).toBe("A1");
    expect(shuffled).toEqual(copy);
  });

  it("đổi mức thấp nhất", () => {
    expect(scoreToLevel(1, ENOUGH, { lowestLevel: "A2" })).toBe("A2");
  });

  it("minSamples sai -> RangeError", () => {
    for (const m of [0, -1, 1.5, NaN]) {
      expect(() => scoreToLevel(5, 3, { minSamples: m })).toThrow(RangeError);
    }
  });
});

describe("ghép calcProfileScore + scoreToLevel (cách bước upsert sẽ dùng)", () => {
  const profile = (scores: (number | null)[], windowSize?: number) => {
    const sampleCount = selectScores(scores, windowSize).length;
    const score = calcProfileScore(scores, windowSize);
    return { score, level: scoreToLevel(score, sampleCount) };
  };

  it("chưa có điểm -> score null, level null", () => {
    expect(profile([])).toEqual({ score: null, level: null });
    expect(profile([null, null])).toEqual({ score: null, level: null });
  });

  it("dưới MIN_SAMPLES: score vẫn có, level null", () => {
    expect(profile([9, 9])).toEqual({ score: 9, level: null });
  });

  it("đủ mẫu: có cả score và level", () => {
    expect(profile([9, 8, 7])).toEqual({ score: 8, level: "B2" });
    expect(profile([5, 5, 5])).toEqual({ score: 5, level: "A2" });
  });

  it("điểm hỏng không được đếm vào sampleCount", () => {
    expect(profile([9, null, 8, NaN])).toEqual({ score: 8.5, level: null }); // chỉ 2 điểm hợp lệ
  });

  it("mức tính trên score ĐÃ LÀM TRÒN (đúng giá trị lưu ở DB): 7.9967 -> 8 -> B2", () => {
    expect(profile([7.99, 8, 8])).toEqual({ score: 8, level: "B2" });
  });

  it("cửa sổ trượt ảnh hưởng mức: 3 bài gần nhất tốt, bài cũ kém", () => {
    expect(profile([9, 9, 9, 1, 1, 1], 3)).toEqual({ score: 9, level: "B2" });
    expect(profile([9, 9, 9, 1, 1, 1], 6)).toEqual({ score: 5, level: "A2" });
  });
});