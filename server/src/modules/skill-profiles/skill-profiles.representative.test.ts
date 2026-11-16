import { describe, it, expect } from "vitest";
import {
  getAttemptGroupKey,
  getFinalScore,
  selectRepresentativeAttempts,
  type AttemptLike,
} from "./skill-profiles.representative";
import { calcProfileScore } from "./skill-profiles.score";
import { DEFAULT_SKILL_WINDOW_SIZE } from "./skill-profiles.constants";

// Attempt giả có thêm field ngoài AttemptLike để kiểm tra hàm giữ nguyên field.
interface TestAttempt extends AttemptLike {
  isLate: boolean;
  errors: unknown;
}

let nextId = 1;
// Tạo attempt: mặc định là bài giao số 1, bài tập số 1, chưa có điểm, nộp ngày 01/01/2026.
const make = (overrides: Partial<TestAttempt> = {}): TestAttempt => ({
  id: nextId++,
  exerciseId: 1,
  assignmentId: 1,
  score: null,
  teacherScore: null,
  submittedAt: new Date("2026-01-01T00:00:00Z"),
  isLate: false,
  errors: null,
  ...overrides,
});

const at = (day: number) => new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`);
const idsOf = (list: readonly { id: number }[]) => list.map((a) => a.id).sort((x, y) => x - y);

describe("getFinalScore", () => {
  it("teacherScore có thì dùng teacherScore, không thì dùng score", () => {
    expect(getFinalScore({ score: 5, teacherScore: 8 })).toBe(8);
    expect(getFinalScore({ score: 5, teacherScore: null })).toBe(5);
  });

  it("điểm 0 là điểm thật, kể cả teacherScore = 0 ghi đè score cao hơn", () => {
    expect(getFinalScore({ score: null, teacherScore: 0 })).toBe(0);
    expect(getFinalScore({ score: 9, teacherScore: 0 })).toBe(0);
  });

  it("không có điểm hoặc điểm hỏng -> null", () => {
    expect(getFinalScore({ score: null, teacherScore: null })).toBeNull();
    expect(getFinalScore({ score: NaN, teacherScore: null })).toBeNull();
    expect(getFinalScore({ score: 11, teacherScore: null })).toBeNull();
    expect(getFinalScore({ score: -1, teacherScore: null })).toBeNull();
    expect(getFinalScore({ score: Infinity, teacherScore: null })).toBeNull();
  });

  it("teacherScore hỏng KHÔNG bị thay bằng score (đúng nghĩa COALESCE)", () => {
    expect(getFinalScore({ score: 7, teacherScore: 11 })).toBeNull();
  });
});

describe("getAttemptGroupKey", () => {
  it("bài giao theo assignmentId, tự luyện theo exerciseId, không đụng nhau", () => {
    expect(getAttemptGroupKey({ assignmentId: 5, exerciseId: 9 })).toBe("a:5");
    expect(getAttemptGroupKey({ assignmentId: null, exerciseId: 5 })).toBe("e:5");
  });
});

describe("selectRepresentativeAttempts: chọn đại diện", () => {
  it("mảng rỗng -> mảng rỗng", () => {
    expect(selectRepresentativeAttempts([])).toEqual([]);
  });

  it("1 attempt có điểm -> chính nó", () => {
    const a = make({ score: 6 });
    expect(selectRepresentativeAttempts([a])).toEqual([a]);
  });

  it("3 attempt của một bài giao -> lấy lần điểm cao nhất", () => {
    const a1 = make({ score: 5, submittedAt: at(1) });
    const a2 = make({ score: 9, submittedAt: at(2) });
    const a3 = make({ score: 7, submittedAt: at(3) });
    expect(selectRepresentativeAttempts([a1, a2, a3])).toEqual([a2]);
  });

  it("attempt cuối thấp hơn attempt đầu vẫn lấy max (lần đầu)", () => {
    const first = make({ score: 9, submittedAt: at(1) });
    const last = make({ score: 4, submittedAt: at(3) });
    expect(selectRepresentativeAttempts([first, last])).toEqual([first]);
  });

  it("teacherScore cao hơn điểm AI -> dùng điểm GV để so sánh", () => {
    const ai = make({ score: 6, submittedAt: at(1) });
    const teacher = make({ score: 5, teacherScore: 8, submittedAt: at(2) });
    expect(selectRepresentativeAttempts([ai, teacher])).toEqual([teacher]);
  });

  it("teacherScore thấp hơn điểm AI của lần khác -> so sau khi tính điểm cuối, lần max thắng", () => {
    const aiHigh = make({ score: 8, submittedAt: at(1) }); // điểm cuối 8
    const teacherLow = make({ score: 9, teacherScore: 5, submittedAt: at(2) }); // điểm cuối 5, không phải 9
    expect(selectRepresentativeAttempts([aiHigh, teacherLow])).toEqual([aiHigh]);
    // Điểm GV ghi đè là max thì được tôn trọng:
    const teacherTop = make({ score: 3, teacherScore: 9.5, submittedAt: at(3) });
    expect(selectRepresentativeAttempts([aiHigh, teacherTop])).toEqual([teacherTop]);
  });

  it("teacherScore NULL -> dùng score", () => {
    const a = make({ score: 7.5, teacherScore: null });
    expect(selectRepresentativeAttempts([a])).toEqual([a]);
  });

  it("attempt chưa chấm (score NULL) bị bỏ, dù mới nhất", () => {
    const graded = make({ score: 4, submittedAt: at(1) });
    const pending = make({ score: null, submittedAt: at(2) });
    expect(selectRepresentativeAttempts([graded, pending])).toEqual([graded]);
  });

  it("điểm NaN hoặc ngoài [0, 10] bị bỏ", () => {
    const valid = make({ score: 3, submittedAt: at(1) });
    const nan = make({ score: NaN, submittedAt: at(2) });
    const tooHigh = make({ score: 11, submittedAt: at(3) });
    const negative = make({ score: -2, submittedAt: at(4) });
    expect(selectRepresentativeAttempts([valid, nan, tooHigh, negative])).toEqual([valid]);
  });

  it("nhóm toàn attempt không có điểm -> không xuất hiện trong kết quả", () => {
    const noScore = make({ assignmentId: 1, score: null });
    const broken = make({ assignmentId: 1, score: 12 });
    const other = make({ assignmentId: 2, exerciseId: 2, score: 6 });
    expect(selectRepresentativeAttempts([noScore, broken, other])).toEqual([other]);
  });

  it("điểm 0 là điểm thật: bài chỉ có điểm 0 vẫn có đại diện", () => {
    const zero = make({ score: 0 });
    expect(selectRepresentativeAttempts([zero])).toEqual([zero]);
  });
});

describe("selectRepresentativeAttempts: hòa điểm", () => {
  it("hòa điểm -> lấy lần nộp mới nhất, mốc thời gian là submittedAt của lần đó", () => {
    const older = make({ score: 8, submittedAt: at(1) });
    const newer = make({ score: 8, submittedAt: at(5) });
    const middle = make({ score: 8, submittedAt: at(3) });
    const [rep] = selectRepresentativeAttempts([older, newer, middle]);
    expect(rep).toBe(newer);
    expect(rep.submittedAt).toEqual(at(5));
  });

  it("hòa điểm do teacherScore bằng score của lần khác -> vẫn lấy lần mới nhất", () => {
    const ai = make({ score: 8, submittedAt: at(1) });
    const teacher = make({ score: 2, teacherScore: 8, submittedAt: at(4) });
    expect(selectRepresentativeAttempts([ai, teacher])).toEqual([teacher]);
  });

  it("hòa cả điểm lẫn submittedAt -> lấy id lớn hơn, bất kể thứ tự đầu vào", () => {
    const same = at(2);
    const small = make({ id: 100, score: 6, submittedAt: same });
    const big = make({ id: 200, score: 6, submittedAt: same });
    expect(selectRepresentativeAttempts([small, big])).toEqual([big]);
    expect(selectRepresentativeAttempts([big, small])).toEqual([big]);
  });
});

describe("selectRepresentativeAttempts: khóa nhóm", () => {
  it("hai lượt giao khác assignmentId, cùng exerciseId -> 2 phần tử", () => {
    const a = make({ assignmentId: 1, exerciseId: 7, score: 5 });
    const b = make({ assignmentId: 2, exerciseId: 7, score: 6 });
    expect(idsOf(selectRepresentativeAttempts([a, b]))).toEqual(idsOf([a, b]));
  });

  it("tự luyện cùng exerciseId nhiều lần -> 1 phần tử (lần cao nhất)", () => {
    const p1 = make({ assignmentId: null, exerciseId: 7, score: 4, submittedAt: at(1) });
    const p2 = make({ assignmentId: null, exerciseId: 7, score: 9, submittedAt: at(2) });
    const p3 = make({ assignmentId: null, exerciseId: 7, score: 6, submittedAt: at(3) });
    expect(selectRepresentativeAttempts([p1, p2, p3])).toEqual([p2]);
  });

  it("tự luyện và bài giao cùng exerciseId -> 2 phần tử riêng", () => {
    const practice = make({ assignmentId: null, exerciseId: 7, score: 5 });
    const assigned = make({ assignmentId: 3, exerciseId: 7, score: 8 });
    expect(idsOf(selectRepresentativeAttempts([practice, assigned]))).toEqual(
      idsOf([practice, assigned])
    );
  });

  it("assignmentId trùng số với exerciseId của tự luyện vẫn không bị gộp", () => {
    const practice = make({ assignmentId: null, exerciseId: 5, score: 5 });
    const assigned = make({ assignmentId: 5, exerciseId: 9, score: 6 });
    expect(selectRepresentativeAttempts([practice, assigned])).toHaveLength(2);
  });
});

describe("selectRepresentativeAttempts: nộp trễ, field khác, bất biến", () => {
  it("nộp trễ có điểm cao nhất vẫn được chọn", () => {
    const onTime = make({ score: 6, isLate: false, submittedAt: at(1) });
    const late = make({ score: 9, isLate: true, submittedAt: at(9) });
    const [rep] = selectRepresentativeAttempts([onTime, late]);
    expect(rep).toBe(late);
    expect(rep.isLate).toBe(true);
  });

  it("trả nguyên attempt (còn errors, isLate), không sao chép", () => {
    const errors = [{ type: "grammar", text: "he go", correction: "he goes" }];
    const a = make({ score: 7, errors });
    const [rep] = selectRepresentativeAttempts([a]);
    expect(rep).toBe(a);
    expect(rep.errors).toBe(errors);
  });

  it("không làm thay đổi mảng đầu vào (thứ tự, độ dài, object)", () => {
    const a1 = make({ score: 5, submittedAt: at(1) });
    const a2 = make({ score: 9, submittedAt: at(2) });
    const a3 = make({ assignmentId: 2, exerciseId: 2, score: 3, submittedAt: at(3) });
    const input = [a1, a2, a3];
    const snapshot = [...input];
    const frozenScores = input.map((a) => a.score);
    selectRepresentativeAttempts(input);
    expect(input).toEqual(snapshot);
    expect(input.every((a, i) => a === snapshot[i])).toBe(true);
    expect(input.map((a) => a.score)).toEqual(frozenScores);
  });
});

describe("selectRepresentativeAttempts: sắp xếp gần nhất trước", () => {
  it("sắp theo submittedAt của attempt ĐẠI DIỆN, không theo lần nộp cuối của nhóm", () => {
    // Bài A: lần cao nhất nộp ngày 2, lần thấp nộp ngày 9 -> đại diện có mốc ngày 2.
    const aBest = make({ assignmentId: 1, exerciseId: 1, score: 9, submittedAt: at(2) });
    const aLow = make({ assignmentId: 1, exerciseId: 1, score: 3, submittedAt: at(9) });
    const b = make({ assignmentId: 2, exerciseId: 2, score: 5, submittedAt: at(5) });
    const c = make({ assignmentId: 3, exerciseId: 3, score: 7, submittedAt: at(7) });
    const result = selectRepresentativeAttempts([aBest, aLow, b, c]);
    expect(result).toEqual([c, b, aBest]);
  });

  it("đầu vào xáo trộn thứ tự thời gian vẫn ra đúng gần nhất trước", () => {
    const d1 = make({ assignmentId: 1, score: 5, submittedAt: at(1) });
    const d3 = make({ assignmentId: 2, score: 5, submittedAt: at(3) });
    const d2 = make({ assignmentId: 3, score: 5, submittedAt: at(2) });
    expect(selectRepresentativeAttempts([d1, d3, d2])).toEqual([d3, d2, d1]);
    expect(selectRepresentativeAttempts([d2, d1, d3])).toEqual([d3, d2, d1]);
  });

  it("hai đại diện cùng submittedAt -> id lớn đứng trước", () => {
    const same = at(4);
    const small = make({ id: 10, assignmentId: 1, score: 5, submittedAt: same });
    const big = make({ id: 20, assignmentId: 2, score: 5, submittedAt: same });
    expect(selectRepresentativeAttempts([small, big])).toEqual([big, small]);
    expect(selectRepresentativeAttempts([big, small])).toEqual([big, small]);
  });

  it("không đổi thứ tự mảng đầu vào khi sắp xếp", () => {
    const old = make({ assignmentId: 1, score: 5, submittedAt: at(1) });
    const recent = make({ assignmentId: 2, score: 5, submittedAt: at(8) });
    const input = [old, recent];
    selectRepresentativeAttempts(input);
    expect(input[0]).toBe(old);
    expect(input[1]).toBe(recent);
  });
});

describe("selectRepresentativeAttempts + calcProfileScore", () => {
  // Một bài giao riêng (assignmentId = exerciseId = i), 1 attempt điểm `score`, nộp ngày `day`.
  const oneAssignment = (i: number, score: number | null, day: number) =>
    make({ assignmentId: i, exerciseId: i, score, submittedAt: at(day) });

  it("có hơn N bài -> chỉ N bài gần nhất được tính", () => {
    // 12 bài: ngày 1-2 điểm 0 (cũ), ngày 3-12 điểm 10 (mới).
    const attempts = Array.from({ length: 12 }, (_, k) =>
      oneAssignment(k + 1, k < 2 ? 0 : 10, k + 1)
    );
    const reps = selectRepresentativeAttempts(attempts);
    expect(reps).toHaveLength(12);
    // Cửa sổ N = 10 chỉ thấy 10 bài mới (đều 10); nếu tính cả 12 sẽ ra 8.33.
    expect(calcProfileScore(reps.map((a) => a.score))).toBe(10);
    expect(DEFAULT_SKILL_WINDOW_SIZE).toBe(10);
  });

  it("nộp nhiều lần một bài giao: hồ sơ dùng lần cao nhất, không phải lần cuối", () => {
    const first = make({ assignmentId: 1, score: 9, submittedAt: at(1) });
    const second = make({ assignmentId: 1, score: 3, submittedAt: at(2) });
    const other = oneAssignment(2, 7, 3);
    const reps = selectRepresentativeAttempts([first, second, other]);
    expect(calcProfileScore(reps.map((a) => a.score))).toBe(8); // (7 + 9) / 2
  });

  it("dùng điểm cuối (GV ghi đè) khi đưa vào calcProfileScore", () => {
    const a = make({ assignmentId: 1, score: 4, teacherScore: 8, submittedAt: at(1) });
    const b = oneAssignment(2, 6, 2);
    const reps = selectRepresentativeAttempts([a, b]);
    const finals = reps.map((r) => getFinalScore(r));
    expect(calcProfileScore(finals)).toBe(7); // (6 + 8) / 2
  });

  it("tự luyện làm lại bài cũ với điểm thấp hơn thì hồ sơ không bị tụt", () => {
    const p1 = make({ assignmentId: null, exerciseId: 1, score: 9, submittedAt: at(1) });
    const p2 = make({ assignmentId: null, exerciseId: 1, score: 2, submittedAt: at(10) });
    const other = make({ assignmentId: null, exerciseId: 2, score: 7, submittedAt: at(5) });
    const reps = selectRepresentativeAttempts([p1, p2, other]);
    expect(reps).toHaveLength(2);
    expect(calcProfileScore(reps.map((a) => a.score))).toBe(8); // (7 + 9) / 2, không có điểm 2
  });

  it("attempt chưa chấm mới nhất không chiếm chỗ trong cửa sổ", () => {
    const graded = Array.from({ length: 10 }, (_, k) => oneAssignment(k + 1, 6, k + 1));
    const pending = oneAssignment(99, null, 20); // mới nhất nhưng chưa chấm
    const reps = selectRepresentativeAttempts([...graded, pending]);
    expect(reps).toHaveLength(10); // bài chưa chấm không có đại diện
    expect(calcProfileScore(reps.map((a) => a.score))).toBe(6);
  });

  it("hạn chế đã biết: luyện lại bài cũ không đẩy bài đó lên đầu cửa sổ", () => {
    // Bài tự luyện 1: lần cao nhất (10) ở ngày 1, luyện lại ngày 20 với điểm 0.
    const bestOld = make({ assignmentId: null, exerciseId: 1, score: 10, submittedAt: at(1) });
    const retryLow = make({ assignmentId: null, exerciseId: 1, score: 0, submittedAt: at(20) });
    // 10 bài khác, ngày 2-11, điểm 5.
    const others = Array.from({ length: 10 }, (_, k) =>
      make({ assignmentId: null, exerciseId: k + 2, score: 5, submittedAt: at(k + 2) })
    );
    const reps = selectRepresentativeAttempts([bestOld, retryLow, ...others]);
    expect(reps).toHaveLength(11);
    expect(reps[reps.length - 1]).toBe(bestOld); // đại diện của bài 1 nằm cuối (mốc ngày 1)
    // Cửa sổ 10 bài gần nhất bỏ bài 1 dù HS vừa luyện lại hôm qua.
    expect(calcProfileScore(reps.map((a) => a.score))).toBe(5);
  });
});