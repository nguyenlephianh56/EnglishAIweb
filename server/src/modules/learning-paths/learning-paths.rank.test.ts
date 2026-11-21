/**
 * Test hàm thuần rankSkills / pickFocusErrorType (T24). Không cần DB hay .env.
 */
import { describe, it, expect } from "vitest";
import { pickFocusErrorType, rankSkills, type ProfileRowInput } from "./learning-paths.rank";

const row = (
  skill: string,
  score: number,
  level: ProfileRowInput["level"] = "A2",
  errorStats: unknown = {}
): ProfileRowInput => ({ skill, score, level, errorStats });

const skillsOf = (ranked: ReturnType<typeof rankSkills>) => ranked.map((r) => r.skill);

describe("rankSkills", () => {
  it("kỹ năng có điểm xếp theo điểm tăng dần (yếu nhất trước), kỹ năng chưa có dữ liệu xếp sau", () => {
    const ranked = rankSkills([row("READING", 7), row("WRITING", 3.5), row("LISTENING", 5)]);
    expect(skillsOf(ranked)).toEqual(["WRITING", "LISTENING", "READING", "SPEAKING", "FOUNDATION"]);
    expect(ranked.map((r) => r.reason)).toEqual([
      "weakest_skill",
      "weakest_skill",
      "weakest_skill",
      "no_data_skill",
      "no_data_skill",
    ]);
  });

  it("hòa điểm thì theo thứ tự enum", () => {
    const ranked = rankSkills([row("WRITING", 5), row("LISTENING", 5), row("FOUNDATION", 5)]);
    expect(skillsOf(ranked).slice(0, 3)).toEqual(["LISTENING", "WRITING", "FOUNDATION"]);
  });

  it("không phụ thuộc thứ tự đầu vào", () => {
    const a = rankSkills([row("READING", 6), row("SPEAKING", 2)]);
    const b = rankSkills([row("SPEAKING", 2), row("READING", 6)]);
    expect(a).toEqual(b);
  });

  it("HS chưa có hồ sơ nào: đủ 5 kỹ năng theo enum, toàn no_data_skill, mức A1", () => {
    const ranked = rankSkills([]);
    expect(skillsOf(ranked)).toEqual(["LISTENING", "SPEAKING", "READING", "WRITING", "FOUNDATION"]);
    expect(ranked.every((r) => r.reason === "no_data_skill")).toBe(true);
    expect(ranked.every((r) => r.level === "A1")).toBe(true);
    expect(ranked.every((r) => r.focusErrorType === null)).toBe(true);
  });

  it("mức mục tiêu = level hiện tại; level null thì A1 (kỹ năng vẫn xếp theo điểm)", () => {
    const ranked = rankSkills([row("READING", 6.5, "B1"), row("WRITING", 2, null)]);
    expect(ranked[0]).toMatchObject({ skill: "WRITING", level: "A1", reason: "weakest_skill" });
    expect(ranked[1]).toMatchObject({ skill: "READING", level: "B1" });
  });

  it("điểm 0 là điểm thật (xếp đầu), không bị coi là chưa có dữ liệu", () => {
    const ranked = rankSkills([row("READING", 4), row("SPEAKING", 0)]);
    expect(ranked[0]).toMatchObject({ skill: "SPEAKING", reason: "weakest_skill" });
  });

  it("điểm hỏng (NaN/Infinity) coi như chưa có dữ liệu", () => {
    const ranked = rankSkills([row("READING", Number.NaN, "B2"), row("WRITING", 5)]);
    expect(skillsOf(ranked)).toEqual(["WRITING", "LISTENING", "SPEAKING", "READING", "FOUNDATION"]);
    expect(ranked.find((r) => r.skill === "READING")).toMatchObject({ reason: "no_data_skill", level: "A1" });
  });

  it("gắn focusErrorType của từng kỹ năng; không sửa đầu vào", () => {
    const input = [row("WRITING", 3, "A1", { "grammar:tense": 4, vocab: 1 })];
    const snapshot = JSON.stringify(input);
    const ranked = rankSkills(input);
    expect(ranked[0].focusErrorType).toBe("grammar:tense");
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("pickFocusErrorType", () => {
  it("lấy loại lỗi nhiều nhất", () => {
    expect(pickFocusErrorType({ "grammar:tense": 5, "grammar:article": 2, vocab: 3 })).toBe("grammar:tense");
  });

  it("chấp nhận cả dạng `nhóm` (không có chi tiết)", () => {
    expect(pickFocusErrorType({ vocab: 4, "grammar:tense": 1 })).toBe("vocab");
  });

  it("hòa số lần thì lấy key nhỏ hơn theo chữ cái (tất định)", () => {
    expect(pickFocusErrorType({ vocab: 2, "grammar:tense": 2 })).toBe("grammar:tense");
    expect(pickFocusErrorType({ "grammar:tense": 2, vocab: 2 })).toBe("grammar:tense");
  });

  it("bỏ qua type sai dạng, dù số lần cao nhất", () => {
    const stats = {
      "grammar:": 99,
      ":tense": 99,
      "a:b:c": 99,
      "lỗi ngữ pháp": 99,
      "grammar tense": 99,
      "Bỏ qua <script>": 99,
      "": 99,
      "grammar:article": 2,
    };
    expect(pickFocusErrorType(stats)).toBe("grammar:article");
  });

  it("bỏ qua số lần không hợp lệ (âm, 0, NaN, chuỗi)", () => {
    expect(pickFocusErrorType({ vocab: -3, pronunciation: 0, "grammar:tense": "9", x: Number.NaN })).toBeNull();
  });

  it("error_stats rỗng/null/mảng/kiểu lạ thì trả null", () => {
    expect(pickFocusErrorType({})).toBeNull();
    expect(pickFocusErrorType(null)).toBeNull();
    expect(pickFocusErrorType(undefined)).toBeNull();
    expect(pickFocusErrorType([["vocab", 3]])).toBeNull();
    expect(pickFocusErrorType("vocab")).toBeNull();
    expect(pickFocusErrorType(5)).toBeNull();
  });

  it("key `__proto__` không làm hỏng kết quả", () => {
    const stats = JSON.parse('{"__proto__": 9, "vocab": 1}');
    expect(pickFocusErrorType(stats)).toBe("vocab");
  });
});