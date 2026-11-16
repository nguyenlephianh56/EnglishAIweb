import { describe, it, expect } from "vitest";
import {
  countWords,
  resolveWritingLimits,
  validateWritingLength,
} from "./writingLength";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const BASE = { maxWords: 600, maxChars: 4000 };

describe("countWords", () => {
  it("rỗng, chỉ khoảng trắng, chỉ dấu câu/ký hiệu -> 0", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t  ")).toBe(0);
    expect(countWords("... !!! ??? -- ,;: @#$%")).toBe(0);
  });

  it("don't, well-known, it’s là 1 từ mỗi từ", () => {
    expect(countWords("don't")).toBe(1);
    expect(countWords("well-known")).toBe(1);
    expect(countWords("it’s")).toBe(1);
    expect(countWords("I don't like well-known songs, it’s true.")).toBe(7);
  });

  it("dấu ' hoặc - ở đầu/cuối từ không nối từ", () => {
    expect(countWords("-hello- 'world'")).toBe(2);
    expect(countWords("a - b")).toBe(2);
  });

  it("xuống dòng, tab, nhiều khoảng trắng liên tiếp", () => {
    expect(countWords("one\ntwo\t\tthree    four\r\nfive")).toBe(5);
  });

  it("số tính là từ", () => {
    expect(countWords("In 2026 I am 20")).toBe(5);
    expect(countWords("2026")).toBe(1);
  });

  it("tiếng Việt có dấu (kể cả dạng tổ hợp NFD)", () => {
    expect(countWords("Hôm nay tôi đi học")).toBe(5);
    expect(countWords("Hôm nay tôi đi học".normalize("NFD"))).toBe(5);
  });
});

describe("resolveWritingLimits", () => {
  it("minWords nhỏ -> giữ trần nền", () => {
    expect(resolveWritingLimits(50, BASE)).toEqual(BASE);
    expect(resolveWritingLimits(100, BASE)).toEqual(BASE); // 100×3×7 = 2100 < 4000
    // 200×3 = 600 từ (bằng nền) nhưng 200×3×7 = 4200 ký tự > 4000 nên nới ký tự
    expect(resolveWritingLimits(200, BASE)).toEqual({ maxWords: 600, maxChars: 4200 });
  });

  it("minWords lớn -> nới cả số từ và số ký tự", () => {
    expect(resolveWritingLimits(1000, BASE)).toEqual({ maxWords: 3000, maxChars: 21000 });
  });
});

describe("validateWritingLength", () => {
  it("đúng minWords -> qua; minWords-1 -> WRITING_TOO_SHORT", () => {
    const ok = validateWritingLength(words(50), 50, BASE);
    expect(ok).toMatchObject({ ok: true, wordCount: 50 });

    const bad = validateWritingLength(words(49), 50, BASE);
    expect(bad).toMatchObject({
      ok: false,
      code: "WRITING_TOO_SHORT",
      wordCount: 49,
      minWords: 50,
    });
  });

  it("đúng maxWords -> qua; +1 -> WRITING_TOO_LONG", () => {
    const base = { maxWords: 100, maxChars: 100000 };
    expect(validateWritingLength(words(100), 10, base).ok).toBe(true);

    const bad = validateWritingLength(words(101), 10, base);
    expect(bad).toMatchObject({
      ok: false,
      code: "WRITING_TOO_LONG",
      wordCount: 101,
      maxWords: 100,
    });
  });

  it("đúng maxChars -> qua; +1 -> WRITING_TOO_LONG", () => {
    const base = { maxWords: 100000, maxChars: 4000 };
    expect(validateWritingLength("a".repeat(4000), 1, base).ok).toBe(true);

    const bad = validateWritingLength("a".repeat(4001), 1, base);
    expect(bad).toMatchObject({
      ok: false,
      code: "WRITING_TOO_LONG",
      charCount: 4001,
      maxChars: 4000,
    });
  });

  it("minWords lớn: trần được nới nên bài dài hợp lệ vẫn qua", () => {
    const text = words(1000); // 4999 ký tự > 4000 nền, nhưng minWords=1000 nới trần
    expect(validateWritingLength(text, 1000, BASE).ok).toBe(true);
  });

  it("vừa quá ngắn vừa quá dài ký tự -> báo TOO_SHORT", () => {
    const r = validateWritingLength("a".repeat(5000), 50, BASE);
    expect(r).toMatchObject({ ok: false, code: "WRITING_TOO_SHORT" });
  });

  it("minWords không hợp lệ coi như 0", () => {
    expect(validateWritingLength("hi", Number.NaN, BASE).ok).toBe(true);
    expect(validateWritingLength("hi", -5, BASE).ok).toBe(true);
  });

  it("kết quả lỗi không chứa nội dung bài viết", () => {
    const secret = "TOPSECRETESSAYCONTENT";
    const r = validateWritingLength(secret, 50, BASE);
    expect(JSON.stringify(r)).not.toContain(secret);
  });
});