import { describe, expect, it } from "vitest";
import { itemIdParamSchema, updateItemBodySchema } from "./learning-paths.schema";

describe("itemIdParamSchema", () => {
  it("nhận số nguyên dương dạng chuỗi chữ số", () => {
    expect(itemIdParamSchema.parse({ itemId: "7" })).toEqual({ itemId: 7 });
    expect(itemIdParamSchema.parse({ itemId: "2147483647" })).toEqual({ itemId: 2147483647 });
  });

  it.each(["abc", "0", "-1", "1.5", "1e3", " 7", "7 ", "", "00", "2147483648", "99999999999999999999", "0x10"])(
    "từ chối %j",
    (value) => {
      // "00" -> 0 bị loại bởi >= 1; các chuỗi còn lại bị regex hoặc giới hạn int4 chặn
      expect(itemIdParamSchema.safeParse({ itemId: value }).success).toBe(false);
    }
  );

  it("từ chối khi thiếu", () => {
    expect(itemIdParamSchema.safeParse({}).success).toBe(false);
  });
});

describe("updateItemBodySchema", () => {
  it("nhận done true/false", () => {
    expect(updateItemBodySchema.parse({ done: true })).toEqual({ done: true });
    expect(updateItemBodySchema.parse({ done: false })).toEqual({ done: false });
  });

  it.each([
    ["thiếu done", {}],
    ["done là chuỗi", { done: "true" }],
    ["done là số", { done: 1 }],
    ["done null", { done: null }],
    ["thừa title", { done: true, title: "x" }],
    ["thừa exercise_id", { done: true, exercise_id: 1 }],
    ["body không phải object", "abc"],
    ["body undefined", undefined],
  ])("từ chối: %s", (_name, body) => {
    expect(updateItemBodySchema.safeParse(body).success).toBe(false);
  });
});