/**
 * Test hàm thuần selectRecommendations / buildItemTitle (T24). Không cần DB hay .env.
 * (Lọc PUBLISHED/in_library/skill/level/bài đã làm là việc của câu truy vấn: test ở bước có DB.)
 */
import { describe, it, expect } from "vitest";
import { rankSkills } from "./learning-paths.rank";
import { buildItemTitle, compareCandidates, selectRecommendations } from "./learning-paths.select";

interface Ex {
  id: number;
  createdAt: Date;
}
const ex = (id: number, day: number): Ex => ({ id, createdAt: new Date(Date.UTC(2026, 0, day)) });

const ranked = rankSkills([
  { skill: "WRITING", score: 2, level: "A1", errorStats: { "grammar:tense": 3 } },
  { skill: "READING", score: 5, level: "A2", errorStats: {} },
]); // thứ tự: WRITING, READING, LISTENING, SPEAKING, FOUNDATION

const pool = (entries: Array<[string, Ex[]]>) => new Map<string, Ex[]>(entries);
const idsOf = (list: Array<{ exercise: Ex }>) => list.map((item) => item.exercise.id);

describe("selectRecommendations", () => {
  it("xen kẽ theo thứ tự kỹ năng đã xếp, tối đa M bài mỗi kỹ năng", () => {
    const result = selectRecommendations(
      ranked,
      pool([
        ["WRITING", [ex(1, 1), ex(2, 2), ex(3, 3)]],
        ["READING", [ex(11, 1), ex(12, 2), ex(13, 3)]],
      ]),
      10
    );
    expect(idsOf(result)).toEqual([1, 11, 2, 12]); // mỗi kỹ năng đúng M = 2
  });

  it("tổng không vượt limit (N)", () => {
    const candidates = pool([
      ["WRITING", [ex(1, 1), ex(2, 2)]],
      ["READING", [ex(11, 1), ex(12, 2)]],
      ["LISTENING", [ex(21, 1), ex(22, 2)]],
      ["SPEAKING", [ex(31, 1), ex(32, 2)]],
      ["FOUNDATION", [ex(41, 1), ex(42, 2)]],
    ]);
    const result = selectRecommendations(ranked, candidates, 5);
    expect(idsOf(result)).toEqual([1, 11, 21, 31, 41]); // vòng 1 đã đủ 5
    expect(selectRecommendations(ranked, candidates, 3)).toHaveLength(3);
    expect(selectRecommendations(ranked, candidates, 10)).toHaveLength(10);
  });

  it("kỹ năng hết bài thì bị bỏ qua, kỹ năng còn bài lấp chỗ", () => {
    const result = selectRecommendations(
      ranked,
      pool([
        ["WRITING", []],
        ["READING", [ex(11, 1), ex(12, 2), ex(13, 3)]],
      ]),
      5
    );
    expect(idsOf(result)).toEqual([11, 12]); // vẫn chỉ tối đa M = 2 từ READING
    expect(result.every((item) => item.skill === "READING")).toBe(true);
  });

  it("thư viện rỗng -> rỗng", () => {
    expect(selectRecommendations(ranked, new Map(), 5)).toEqual([]);
  });

  it("sắp xếp tất định: created_at tăng dần rồi id; gọi hai lần, đảo thứ tự đầu vào vẫn giống nhau", () => {
    const a = [ex(5, 2), ex(3, 2), ex(9, 1)];
    const first = selectRecommendations(ranked, pool([["WRITING", a]]), 5);
    const second = selectRecommendations(ranked, pool([["WRITING", [...a].reverse()]]), 5);
    expect(idsOf(first)).toEqual([9, 3]); // ngày 1 trước; hai bài cùng ngày thì id nhỏ trước; chỉ lấy M = 2
    expect(second).toEqual(first);
    expect(selectRecommendations(ranked, pool([["WRITING", a]]), 5)).toEqual(first);
  });

  it("mỗi gợi ý mang kỹ năng, mức, reason và focusErrorType của kỹ năng đó", () => {
    const result = selectRecommendations(
      ranked,
      pool([
        ["WRITING", [ex(1, 1)]],
        ["LISTENING", [ex(21, 1)]],
      ]),
      5
    );
    expect(result[0]).toMatchObject({ skill: "WRITING", level: "A1", reason: "weakest_skill", focusErrorType: "grammar:tense" });
    expect(result[1]).toMatchObject({ skill: "LISTENING", level: "A1", reason: "no_data_skill", focusErrorType: null });
  });

  it("limit không hợp lệ (0, âm, số lẻ) -> rỗng; không sửa đầu vào", () => {
    const input = [ex(2, 2), ex(1, 1)];
    const candidates = pool([["WRITING", input]]);
    expect(selectRecommendations(ranked, candidates, 0)).toEqual([]);
    expect(selectRecommendations(ranked, candidates, -1)).toEqual([]);
    expect(selectRecommendations(ranked, candidates, 1.5)).toEqual([]);
    selectRecommendations(ranked, candidates, 5);
    expect(input.map((e) => e.id)).toEqual([2, 1]);
  });

  it("một bài xuất hiện ở hai kỹ năng (dữ liệu lỗi) chỉ được chọn một lần", () => {
    const shared = ex(7, 1);
    const result = selectRecommendations(ranked, pool([["WRITING", [shared]], ["READING", [shared]]]), 5);
    expect(idsOf(result)).toEqual([7]);
  });
});

describe("compareCandidates", () => {
  it("created_at rồi id", () => {
    expect(compareCandidates(ex(1, 1), ex(2, 2))).toBeLessThan(0);
    expect(compareCandidates(ex(2, 1), ex(1, 1))).toBeGreaterThan(0);
    expect(compareCandidates(ex(1, 1), ex(1, 1))).toBe(0);
  });
});

describe("buildItemTitle", () => {
  it("có loại lỗi", () => {
    expect(buildItemTitle("WRITING", "A2", "grammar:tense")).toBe("Luyện Viết mức A2: tập trung lỗi grammar:tense");
  });
  it("không có loại lỗi", () => {
    expect(buildItemTitle("READING", "B1", null)).toBe("Luyện Đọc mức B1");
  });
  it("đủ nhãn tiếng Việt cho 5 kỹ năng", () => {
    expect(buildItemTitle("LISTENING", "A1", null)).toBe("Luyện Nghe mức A1");
    expect(buildItemTitle("SPEAKING", "A1", null)).toBe("Luyện Nói mức A1");
    expect(buildItemTitle("FOUNDATION", "A1", null)).toBe("Luyện Nền tảng mức A1");
  });
});