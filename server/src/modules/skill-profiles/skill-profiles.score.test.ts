import { describe, it, expect } from "vitest";
import { calcProfileScore, selectScores } from "./skill-profiles.score";
import { DEFAULT_SKILL_WINDOW_SIZE } from "./skill-profiles.constants";

// Mảng n phần tử cùng giá trị.
const fill = (n: number, value: number) => Array.from({ length: n }, () => value);

describe("calcProfileScore", () => {
  it("mảng rỗng -> null (không 0, không NaN)", () => {
    const result = calcProfileScore([]);
    expect(result).toBeNull();
    expect(result).not.toBe(0);
  });

  it("1 phần tử -> chính điểm đó", () => {
    expect(calcProfileScore([7])).toBe(7);
    expect(calcProfileScore([5.5])).toBe(5.5);
  });

  it("điểm 0 là điểm thật: [0] -> 0, không bị nhầm với rỗng", () => {
    expect(calcProfileScore([0])).toBe(0);
    expect(calcProfileScore([0, 0, 0])).toBe(0);
  });

  it("ít hơn N: tính trên số hiện có", () => {
    expect(calcProfileScore([6, 8])).toBe(7);
  });

  it("đúng N phần tử: trung bình cả N", () => {
    expect(calcProfileScore([...fill(5, 10), ...fill(5, 0)])).toBe(5);
  });

  it("nhiều hơn N: chỉ lấy N phần tử ĐẦU (đầu = gần nhất), phần cũ hơn bị bỏ", () => {
    // 10 điểm gần nhất = 10; 5 điểm cũ = 0 không được tính
    expect(calcProfileScore([...fill(10, 10), ...fill(5, 0)])).toBe(10);
    // đảo thứ tự: 10 điểm đầu là 0 -> 0
    expect(calcProfileScore([...fill(10, 0), ...fill(5, 10)])).toBe(0);
  });

  it("làm tròn 2 chữ số", () => {
    expect(calcProfileScore([7, 7, 8])).toBe(7.33); // 7.333… -> 7.33
    expect(calcProfileScore([7, 8, 8])).toBe(7.67); // 7.666… -> 7.67
    expect(calcProfileScore([6.5, 7])).toBe(6.75); // không cần làm tròn
  });

  it("làm tròn nửa: theo round2 dùng chung, 7.995 -> 8 (vì 7.995*100 đúng bằng 799.5)", () => {
    expect(calcProfileScore([7.995])).toBe(8);
    expect(calcProfileScore([7.985])).toBe(7.99);
  });

  it("bỏ null/undefined", () => {
    expect(calcProfileScore([null, undefined, 6, null, 8])).toBe(7);
    expect(calcProfileScore([null, undefined])).toBeNull();
  });

  it("bỏ NaN, Infinity, âm, lớn hơn 10, không phải số", () => {
    const bad = [NaN, Infinity, -Infinity, -0.01, 10.01, 11, -5, "8" as unknown as number];
    expect(calcProfileScore([...bad, 4])).toBe(4);
    expect(calcProfileScore(bad)).toBeNull();
  });

  it("biên thang: 0 và 10 hợp lệ", () => {
    expect(calcProfileScore([0, 10])).toBe(5);
  });

  it("bỏ phần tử hỏng TRƯỚC khi cắt N: điểm hỏng không làm cửa sổ hụt", () => {
    expect(calcProfileScore([null, 9, NaN, 7, 1], 2)).toBe(8); // lấy 9 và 7, không phải 1
  });

  it("đổi N làm kết quả đổi theo", () => {
    const scores = [10, 10, 4, 4, 4, 4];
    expect(calcProfileScore(scores, 2)).toBe(10);
    expect(calcProfileScore(scores, 4)).toBe(7);
    expect(calcProfileScore(scores, 6)).toBe(6);
    expect(calcProfileScore(scores, 100)).toBe(6); // N lớn hơn số điểm: dùng hết
  });

  it("không truyền N: dùng mặc định DEFAULT_SKILL_WINDOW_SIZE (10)", () => {
    expect(DEFAULT_SKILL_WINDOW_SIZE).toBe(10);
    const scores = [...fill(DEFAULT_SKILL_WINDOW_SIZE, 8), 0, 0];
    expect(calcProfileScore(scores)).toBe(8);
  });

  it("N không phải số nguyên >= 1 -> RangeError", () => {
    for (const n of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => calcProfileScore([5], n)).toThrow(RangeError);
    }
  });

  it("không sửa mảng đầu vào", () => {
    const input = Object.freeze([null, 9, 7, 1]) as readonly (number | null)[];
    expect(() => calcProfileScore(input, 2)).not.toThrow();
    expect(input).toEqual([null, 9, 7, 1]);
  });
});

describe("selectScores", () => {
  it("trả đúng các điểm hợp lệ, cắt N đầu; độ dài = sampleCount", () => {
    const selected = selectScores([null, 9, NaN, 7, 5, 3], 3);
    expect(selected).toEqual([9, 7, 5]);
    expect(selected.length).toBe(3);
  });

  it("ít điểm hợp lệ hơn N: độ dài là số điểm hợp lệ thực tế", () => {
    expect(selectScores([null, 6, undefined, 8]).length).toBe(2);
    expect(selectScores([])).toEqual([]);
  });

  it("N sai -> RangeError", () => {
    expect(() => selectScores([1], 0)).toThrow(RangeError);
  });
});