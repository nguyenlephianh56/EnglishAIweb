/** Test Zod đầu ra của lộ trình AI (thuần, không cần DB/.env). */
import { describe, it, expect } from "vitest";
import { AI_TITLE_MAX_LENGTH, WEEKLY_PATH_SIZE } from "../../modules/learning-paths/learning-paths.constants";
import { buildItemTitle } from "../../modules/learning-paths/learning-paths.select";
import { createPathResultSchema, type PathSchemaCandidate } from "./path.schema";

const candidates: PathSchemaCandidate[] = Array.from({ length: 8 }, (_, i) => ({
  ref: `c${i + 1}`,
  skill: "WRITING",
  level: "A2",
  focus_error_type: i === 0 ? "grammar:tense" : null,
}));
const schema = createPathResultSchema(candidates);
const parse = (value: unknown) => schema.safeParse(value);

describe("createPathResultSchema", () => {
  it("giữ thứ tự AI sắp (không sắp lại theo ref)", () => {
    const result = parse({ items: [{ ref: "c3", title: "C" }, { ref: "c1", title: "A" }, { ref: "c2", title: "B" }] });
    expect(result.success && result.data.items.map((i) => i.ref)).toEqual(["c3", "c1", "c2"]);
  });

  it("ref lạ bị loại (kể cả sai kiểu, sai hoa/thường, có khoảng trắng)", () => {
    const result = parse({
      items: [{ ref: "c99", title: "x" }, { ref: "C1", title: "x" }, { ref: " c1", title: "x" }, { ref: 1, title: "x" }, { ref: "c2", title: "ok" }],
    });
    expect(result.success && result.data.items).toEqual([{ ref: "c2", title: "ok" }]);
  });

  it("trùng ref giữ lần đầu", () => {
    const result = parse({ items: [{ ref: "c1", title: "đầu" }, { ref: "c1", title: "sau" }, { ref: "c2", title: "b" }] });
    expect(result.success && result.data.items).toEqual([{ ref: "c1", title: "đầu" }, { ref: "c2", title: "b" }]);
  });

  it(`vượt N = ${WEEKLY_PATH_SIZE} thì cắt, giữ N phần tử hợp lệ đầu tiên`, () => {
    const items = [{ ref: "zz", title: "lạ" }, ...candidates.map((c) => ({ ref: c.ref, title: `t${c.ref}` }))];
    const result = parse({ items });
    expect(result.success && result.data.items.map((i) => i.ref)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("AI trả ít hơn N thì giữ nguyên, không bù", () => {
    const result = parse({ items: [{ ref: "c4", title: "chỉ một" }] });
    expect(result.success && result.data.items).toHaveLength(1);
  });

  it("title được làm sạch: thẻ HTML, xuống dòng, ký tự điều khiển, khoảng trắng thừa", () => {
    const result = parse({ items: [{ ref: "c1", title: "  <b>Luyện</b>\n Viết\u0000   mức\tA2 " }] });
    expect(result.success && result.data.items[0].title).toBe("Luyện Viết mức A2");
  });

  it(`title đúng ${AI_TITLE_MAX_LENGTH} ký tự giữ nguyên, hơn 1 ký tự thì cắt`, () => {
    const exact = "a".repeat(AI_TITLE_MAX_LENGTH);
    const result = parse({ items: [{ ref: "c1", title: exact }, { ref: "c2", title: exact + "b" }] });
    expect(result.success && result.data.items.map((i) => i.title)).toEqual([exact, exact]);
  });

  it("title rỗng sau làm sạch / thiếu / sai kiểu -> buildItemTitle của bản luật", () => {
    const result = parse({
      items: [{ ref: "c1", title: "  <i></i> " }, { ref: "c2" }, { ref: "c3", title: 123 }],
    });
    expect(result.success && result.data.items.map((i) => i.title)).toEqual([
      buildItemTitle("WRITING", "A2", "grammar:tense"),
      buildItemTitle("WRITING", "A2", null),
      buildItemTitle("WRITING", "A2", null),
    ]);
  });

  it("phần tử không phải object bị loại, field thừa trong phần tử bị bỏ", () => {
    const result = parse({ items: ["c1", null, [], 5, { ref: "c2", title: "ok", exercise_id: 9, done: true }] });
    expect(result.success && result.data.items).toEqual([{ ref: "c2", title: "ok" }]);
  });

  it("envelope sai: field lạ, thiếu items, items không phải mảng, không phải object", () => {
    expect(parse({ items: [{ ref: "c1", title: "a" }], extra: 1 }).success).toBe(false);
    expect(parse({}).success).toBe(false);
    expect(parse({ items: "c1" }).success).toBe(false);
    expect(parse({ items: { ref: "c1" } }).success).toBe(false);
    expect(parse([{ ref: "c1", title: "a" }]).success).toBe(false);
    expect(parse(null).success).toBe(false);
  });

  it("loại hết hoặc rỗng -> lỗi schema", () => {
    expect(parse({ items: [] }).success).toBe(false);
    expect(parse({ items: [{ ref: "c99", title: "x" }, "rác"] }).success).toBe(false);
  });

  it("tham số size tùy chỉnh được dùng", () => {
    const small = createPathResultSchema(candidates, 2);
    const result = small.safeParse({ items: candidates.map((c) => ({ ref: c.ref, title: "t" })) });
    expect(result.success && result.data.items).toHaveLength(2);
  });
});