import { describe, expect, it } from "vitest";
import { teacherGradeSchema, TEACHER_COMMENT_MAX_LENGTH } from "../../modules/attempts/attempts.grade.schema";
import { commentSuggestSchema, sanitizeSuggestedComment } from "./comment-suggest.schema";

const MAX = TEACHER_COMMENT_MAX_LENGTH;

describe("sanitizeSuggestedComment", () => {
  it("giữ nguyên nhận xét sạch, chỉ trim hai đầu", () => {
    expect(sanitizeSuggestedComment("  Em viết khá tốt!  ")).toBe("Em viết khá tốt!");
  });

  it("bỏ thẻ HTML (kể cả lồng nhau, comment, script) nhưng giữ chữ", () => {
    expect(sanitizeSuggestedComment("Em <b>làm tốt</b> phần <i>mở bài</i>.")).toBe("Em làm tốt phần mở bài.");
    expect(sanitizeSuggestedComment("A<script>alert(1)</script>B")).toBe("Aalert(1)B");
    expect(sanitizeSuggestedComment("A<!-- ẩn -->B")).toBe("AB");
    expect(sanitizeSuggestedComment("A<<b>script>B")).not.toMatch(/[<>]/);
  });

  it("bỏ ký tự điều khiển và ký tự vô hình, đổi tab thành khoảng trắng", () => {
    const dirty = "Em\u0000 viết\u0007 tốt\u200B\u202E\uFEFF!\u007F\ttiếp";
    expect(sanitizeSuggestedComment(dirty)).toBe("Em viết tốt! tiếp");
  });

  it("giữ xuống dòng, đổi \\r\\n và U+2028 thành \\n", () => {
    expect(sanitizeSuggestedComment("Câu 1.\r\nCâu 2.\rCâu 3.\u2028Câu 4.")).toBe("Câu 1.\nCâu 2.\nCâu 3.\nCâu 4.");
  });

  it("gộp dòng trống thừa (tối đa 1 dòng trống) và bỏ khoảng trắng đầu/cuối dòng", () => {
    expect(sanitizeSuggestedComment("A  \n\n\n\n  B \n   \n\n\nC")).toBe("A\n\nB\n\nC");
  });

  it(`cắt đúng ${MAX} ký tự: đúng giới hạn giữ nguyên, hơn 1 ký tự bị cắt`, () => {
    const exact = "a".repeat(MAX);
    expect(sanitizeSuggestedComment(exact)).toBe(exact);
    expect(sanitizeSuggestedComment(exact + "b")).toBe(exact);
    expect(sanitizeSuggestedComment("a".repeat(MAX * 3))).toHaveLength(MAX);
  });

  it("không để lại nửa cặp surrogate khi cắt giữa emoji", () => {
    const out = sanitizeSuggestedComment("a".repeat(MAX - 1) + "😀😀");
    expect(out.length).toBeLessThanOrEqual(MAX);
    expect(out).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(out).toBe("a".repeat(MAX - 1));
  });

  it("cắt xong vẫn không có khoảng trắng thừa ở cuối", () => {
    const out = sanitizeSuggestedComment("a".repeat(MAX - 1) + "   b");
    expect(out).toBe("a".repeat(MAX - 1));
  });

  it("tham số max tùy chọn", () => {
    expect(sanitizeSuggestedComment("abcdef", 3)).toBe("abc");
  });

  it("kết quả không rỗng luôn qua được schema teacher_comment của T20", () => {
    const samples = [
      "Em  làm tốt\n\n\nnhưng cần xem lại thì quá khứ.",
      "<p>" + "Tốt! ".repeat(500) + "</p>",
      "\u0000\u0001x\u0002",
      "😀".repeat(MAX),
      "x".repeat(MAX + 50),
      "  nhận xét  ",
    ];
    for (const raw of samples) {
      const comment = sanitizeSuggestedComment(raw);
      expect(comment.length).toBeGreaterThan(0);
      const parsed = teacherGradeSchema.safeParse({ teacher_comment: comment });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.teacher_comment).toBe(comment);
    }
  });

  it("chuỗi chỉ gồm thẻ/khoảng trắng/ký tự điều khiển -> rỗng", () => {
    expect(sanitizeSuggestedComment(" <b></b> \u0000 \n\n ")).toBe("");
  });
});

describe("commentSuggestSchema", () => {
  it("chấp nhận { comment } và trả bản đã làm sạch", () => {
    expect(commentSuggestSchema.parse({ comment: " <b>Tốt</b>\n\n\n\nLắm " })).toEqual({ comment: "Tốt\n\nLắm" });
  });

  it("từ chối field lạ (envelope .strict())", () => {
    expect(commentSuggestSchema.safeParse({ comment: "ok", score: 10 }).success).toBe(false);
  });

  it("từ chối thiếu comment, sai kiểu, không phải object", () => {
    for (const bad of [{}, { comment: 5 }, { comment: null }, "ok", null, [], { Comment: "x" }]) {
      expect(commentSuggestSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rỗng sau khi làm sạch -> không hợp lệ (để lớp AI báo sai định dạng)", () => {
    for (const comment of ["", "   ", "<b></b>", "\u0000\u200B", "<p>\n</p>"]) {
      expect(commentSuggestSchema.safeParse({ comment }).success).toBe(false);
    }
  });

  it("nhận xét quá dài bị cắt chứ không bị từ chối", () => {
    const out = commentSuggestSchema.parse({ comment: "x".repeat(MAX * 2) });
    expect(out.comment).toHaveLength(MAX);
  });
});