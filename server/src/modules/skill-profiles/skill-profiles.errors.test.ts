/**
 * Test thuần (KHÔNG cần DB, KHÔNG cần .env): mergeErrorStats cộng số lần theo errors[].type.
 */
import { describe, it, expect } from "vitest";
import { mergeErrorStats } from "./skill-profiles.errors";

describe("mergeErrorStats: cộng đúng", () => {
  it("không có attempt -> {}", () => {
    expect(mergeErrorStats([])).toEqual({});
  });

  it("một attempt, mỗi phần tử tính 1 lần (cùng type lặp lại thì cộng)", () => {
    const result = mergeErrorStats([
      {
        errors: [
          { type: "grammar:tense", text: "he go", correction: "he goes" },
          { type: "grammar:tense", text: "she go", correction: "she goes" },
          { type: "vocab", text: "big", correction: "huge" },
        ],
      },
    ]);
    expect(result).toEqual({ "grammar:tense": 2, vocab: 1 });
  });

  it("nhiều attempt cộng dồn theo type", () => {
    const result = mergeErrorStats([
      { errors: [{ type: "grammar:article" }, { type: "vocab" }] },
      { errors: [{ type: "grammar:article" }] },
      { errors: [{ type: "pronunciation" }, { type: "vocab" }] },
    ]);
    expect(result).toEqual({ "grammar:article": 2, vocab: 2, pronunciation: 1 });
  });

  it("key là nguyên chuỗi: khác hoa/thường là key khác, không bị chuẩn hóa", () => {
    const result = mergeErrorStats([
      { errors: [{ type: "Vocab" }, { type: "vocab" }, { type: " vocab" }] },
    ]);
    expect(result).toEqual({ Vocab: 1, vocab: 1, " vocab": 1 });
  });

  it("không sửa đầu vào", () => {
    const attempts = [{ errors: [{ type: "vocab" }] }];
    const snapshot = JSON.stringify(attempts);
    mergeErrorStats(attempts);
    expect(JSON.stringify(attempts)).toBe(snapshot);
  });
});

describe("mergeErrorStats: dữ liệu hỏng không làm vỡ hàm", () => {
  it("errors null / undefined / thiếu field -> đóng góp 0", () => {
    expect(mergeErrorStats([{ errors: null }, { errors: undefined }, {}])).toEqual({});
  });

  it("errors không phải mảng (object, chuỗi, số) -> bỏ qua", () => {
    expect(
      mergeErrorStats([
        { errors: { type: "vocab" } },
        { errors: "vocab" },
        { errors: 5 },
        { errors: true },
      ])
    ).toEqual({});
  });

  it("errors là mảng rỗng -> {}", () => {
    expect(mergeErrorStats([{ errors: [] }])).toEqual({});
  });

  it("phần tử hỏng bị bỏ, phần tử tốt cùng mảng vẫn được tính", () => {
    const result = mergeErrorStats([
      {
        errors: [
          null,
          undefined,
          42,
          "vocab",
          ["vocab"],
          {},
          { text: "no type" },
          { type: "grammar:tense" },
        ],
      },
    ]);
    expect(result).toEqual({ "grammar:tense": 1 });
  });

  it("type không phải chuỗi -> bỏ qua", () => {
    const result = mergeErrorStats([
      {
        errors: [
          { type: 1 },
          { type: null },
          { type: true },
          { type: ["vocab"] },
          { type: { a: 1 } },
          { type: "vocab" },
        ],
      },
    ]);
    expect(result).toEqual({ vocab: 1 });
  });

  it("type rỗng hoặc chỉ toàn khoảng trắng -> bỏ qua", () => {
    expect(mergeErrorStats([{ errors: [{ type: "" }, { type: "   " }, { type: "\t\n" }] }])).toEqual(
      {}
    );
  });

  it("key đặc biệt (__proto__, constructor) chỉ là key thường, không đụng prototype", () => {
    const result = mergeErrorStats([
      { errors: [{ type: "__proto__" }, { type: "constructor" }, { type: "constructor" }] },
    ]);
    expect(Object.keys(result).sort()).toEqual(["__proto__", "constructor"]);
    expect(result["constructor"]).toBe(2);
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});