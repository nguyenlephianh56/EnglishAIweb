/** Test Zod của query `limit` (T24). Không cần DB hay .env. */
import { describe, expect, it } from "vitest";
import { recommendationsQuerySchema, resolveRecommendationLimit } from "./learning-paths.schema";

const parse = (query: unknown) => recommendationsQuerySchema.safeParse(query);

describe("recommendationsQuerySchema", () => {
  it("không gửi limit -> dùng mặc định 5", () => {
    const result = parse({});
    expect(result.success).toBe(true);
    if (result.success) expect(resolveRecommendationLimit(result.data)).toBe(5);
  });

  it("nhận số nguyên 1..10", () => {
    for (const value of ["1", "5", "10", "007"]) {
      const result = parse({ limit: value });
      expect(result.success).toBe(true);
    }
    const ten = parse({ limit: "10" });
    if (ten.success) expect(resolveRecommendationLimit(ten.data)).toBe(10);
  });

  it("từ chối 0, 11, âm, số lẻ, chữ, rỗng, khoảng trắng, dạng khoa học, mảng, object", () => {
    const bad: unknown[] = ["0", "11", "-1", "2.5", "abc", "", " 5", "5 ", "1e1", "+5", ["1", "2"], { a: "1" }, "99999999999999999999"];
    for (const value of bad) {
      expect(parse({ limit: value }).success, `limit=${JSON.stringify(value)}`).toBe(false);
    }
  });

  it("thông báo lỗi là tiếng Việt, nêu rõ khoảng hợp lệ", () => {
    const result = parse({ limit: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("limit phải là số nguyên từ 1 đến 10");
  });

  it("tham số lạ khác bị bỏ qua, không gây lỗi", () => {
    const result = parse({ limit: "3", student_id: "999", studentId: "999" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ limit: 3 });
  });
});