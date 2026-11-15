import { describe, it, expect } from "vitest";
import { computeWritingScore, type WritingCriteria } from "./writingScore";

const c = (
  content: number,
  coherence: number,
  vocabulary: number,
  grammar: number
): WritingCriteria => ({ content, coherence, vocabulary, grammar });

describe("computeWritingScore", () => {
  it("các tiêu chí bằng nhau -> điểm đúng bằng giá trị đó", () => {
    expect(computeWritingScore(c(7, 7, 7, 7))).toBe(7);
    expect(computeWritingScore(c(5.5, 5.5, 5.5, 5.5))).toBe(5.5);
  });

  it("trung bình cộng 4 tiêu chí, không trọng số", () => {
    expect(computeWritingScore(c(6, 7, 8, 9))).toBe(7.5);
    // đổi chỗ các tiêu chí không đổi kết quả (không trọng số)
    expect(computeWritingScore(c(9, 8, 7, 6))).toBe(7.5);
  });

  it("làm tròn 2 chữ số khi tổng chia 4 ra 3 chữ số thập phân", () => {
    expect(computeWritingScore(c(7, 7, 7, 8))).toBe(7.25); // 7.25: không cần làm tròn
    expect(computeWritingScore(c(6.5, 7, 7, 7))).toBe(6.88); // 6.875 -> 6.88
    expect(computeWritingScore(c(8.5, 7, 7, 7))).toBe(7.38); // 7.375 -> 7.38
  });

  it("biên: toàn 0 -> 0, toàn 10 -> 10", () => {
    expect(computeWritingScore(c(0, 0, 0, 0))).toBe(0);
    expect(computeWritingScore(c(10, 10, 10, 10))).toBe(10);
  });

  it("không bao giờ vượt thang 0..10 với đầu vào hợp lệ", () => {
    const score = computeWritingScore(c(10, 10, 10, 0));
    expect(score).toBe(7.5);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("từ chối dữ liệu hỏng thay vì trả điểm sai", () => {
    expect(() => computeWritingScore(c(-1, 7, 7, 7))).toThrow(RangeError);
    expect(() => computeWritingScore(c(7, 11, 7, 7))).toThrow(RangeError);
    expect(() => computeWritingScore(c(7, 7, Number.NaN, 7))).toThrow(RangeError);
    expect(() => computeWritingScore(c(7, 7, 7, Infinity))).toThrow(RangeError);
    // thiếu tiêu chí (ép kiểu để mô phỏng dữ liệu hỏng lọt qua)
    expect(() =>
      computeWritingScore({ content: 7, coherence: 7, vocabulary: 7 } as unknown as WritingCriteria)
    ).toThrow(RangeError);
  });

  it("không đổi object đầu vào (hàm thuần)", () => {
    const input = c(6, 7, 8, 9);
    computeWritingScore(input);
    expect(input).toEqual({ content: 6, coherence: 7, vocabulary: 8, grammar: 9 });
  });
});