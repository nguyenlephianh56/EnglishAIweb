import { describe, it, expect } from "vitest";
import { validateExercise, formatPath } from "./validate-exercise";

/** Gọi validateExercise, yêu cầu thất bại và trả về danh sách lỗi. */
function errorsOf(type: unknown, content: unknown, answer: unknown) {
  const result = validateExercise(type, content, answer);
  if (result.success) {
    throw new Error("Mong đợi thất bại nhưng validateExercise trả về success");
  }
  return result.errors;
}

/** Kiểm tra có lỗi tại đúng `path` và thông báo chứa `text`. */
function expectError(
  type: unknown,
  content: unknown,
  answer: unknown,
  path: string,
  text: string
) {
  const errors = errorsOf(type, content, answer);
  const found = errors.find((e) => e.path === path && e.message.includes(text));
  expect(found, JSON.stringify(errors)).toBeDefined();
}

// ===========================================================================
describe("formatPath", () => {
  it("ghép đường dẫn, số dùng ngoặc vuông", () => {
    expect(formatPath("content", [])).toBe("content");
    expect(formatPath("content", ["questions", 0, "options", 1])).toBe(
      "content.questions[0].options[1]"
    );
    expect(formatPath("answer", [2, 0])).toBe("answer[2][0]");
  });
});

// ===========================================================================
describe("multiple_choice", () => {
  const content = {
    passage: "Tom lives in a small town.",
    questions: [
      { q: "Where does Tom live?", options: ["A city", "A small town", "A village"] },
      { q: "Is Tom a student?", options: ["Yes", "No"] },
    ],
  };

  it("hợp lệ đầy đủ", () => {
    const result = validateExercise("multiple_choice", content, [1, 0]);
    expect(result).toEqual({ success: true, data: { content, answer: [1, 0] } });
  });

  it("hợp lệ tối giản (không có passage)", () => {
    const min = { questions: [{ q: "2 + 2 = ?", options: ["3", "4"] }] };
    expect(validateExercise("multiple_choice", min, [1]).success).toBe(true);
  });

  it("trả dữ liệu đã trim", () => {
    const result = validateExercise(
      "multiple_choice",
      { questions: [{ q: "  Hi?  ", options: [" a ", " b "] }] },
      [0]
    );
    expect(result.success && result.data.content.questions[0].q).toBe("Hi?");
  });

  it("sai: thiếu field bắt buộc (questions)", () => {
    expectError("multiple_choice", {}, [0], "content.questions", "bắt buộc");
  });

  it("sai: chuỗi rỗng", () => {
    expectError(
      "multiple_choice",
      { questions: [{ q: " ", options: ["a", "b"] }] },
      [0],
      "content.questions[0].q",
      "không được để trống"
    );
  });

  it("sai: sai kiểu (q là số)", () => {
    expectError(
      "multiple_choice",
      { questions: [{ q: 5, options: ["a", "b"] }] },
      [0],
      "content.questions[0].q",
      "phải là chuỗi"
    );
  });

  it("sai: độ dài answer không khớp số câu", () => {
    expectError("multiple_choice", content, [1], "answer", "số câu hỏi");
    expectError("multiple_choice", content, [1, 0, 0], "answer", "số câu hỏi");
  });

  it("sai: chỉ số đáp án ngoài phạm vi options", () => {
    // Câu 2 chỉ có 2 lựa chọn (0..1) nên 2 là ngoài phạm vi
    expectError("multiple_choice", content, [1, 2], "answer[1]", "từ 0 đến 1");
  });

  it("sai: chỉ số âm / số thực / sai kiểu trong answer", () => {
    expectError("multiple_choice", content, [-1, 0], "answer[0]", "không được là số âm");
    expectError("multiple_choice", content, [0.5, 0], "answer[0]", "số nguyên");
    expectError("multiple_choice", content, ["1", 0], "answer[0]", "phải là số");
  });

  it("sai: thiếu answer", () => {
    expectError("multiple_choice", content, undefined, "answer", "bắt buộc phải có đáp án");
    expectError("multiple_choice", content, null, "answer", "bắt buộc phải có đáp án");
  });
});

// ===========================================================================
describe("fill_blank", () => {
  it("hợp lệ đầy đủ (hint + 1 chỗ trống)", () => {
    const content = { text: "He ___ to school every day.", hint: "go" };
    const result = validateExercise("fill_blank", content, ["goes"]);
    expect(result).toEqual({ success: true, data: { content, answer: ["goes"] } });
  });

  it("hợp lệ tối giản (không hint, 2 chỗ trống, gạch dưới dài tính 1 chỗ)", () => {
    expect(validateExercise("fill_blank", { text: "A ___ and B _____." }, ["x", "y"]).success).toBe(true);
  });

  it("sai: thiếu field text", () => {
    expectError("fill_blank", {}, ["a"], "content.text", "bắt buộc");
  });

  it("sai: text không có chỗ trống", () => {
    expectError("fill_blank", { text: "No blank." }, ["a"], "content.text", "chỗ trống");
  });

  it("sai: chuỗi rỗng / sai kiểu", () => {
    expectError("fill_blank", { text: "  " }, ["a"], "content.text", "không được để trống");
    expectError("fill_blank", { text: 1 }, ["a"], "content.text", "phải là chuỗi");
    expectError("fill_blank", { text: "I ___ ok." }, ["  "], "answer[0]", "không được để trống");
  });

  it("sai: 2 chỗ trống nhưng 1 đáp án", () => {
    expectError("fill_blank", { text: "I ___ a ___." }, ["am"], "answer", "chỗ trống");
  });

  it("sai: 1 chỗ trống nhưng 2 đáp án", () => {
    expectError("fill_blank", { text: "I ___ ok." }, ["am", "is"], "answer", "chỗ trống");
  });

  it("sai: thiếu answer", () => {
    expectError("fill_blank", { text: "I ___ ok." }, undefined, "answer", "bắt buộc phải có đáp án");
  });
});

// ===========================================================================
describe("matching", () => {
  const content = { left: ["dog", "cat", "bird"], right: ["chó", "mèo", "chim"] };

  it("hợp lệ (đầy đủ = tối giản)", () => {
    const answer = [[0, 0], [1, 1], [2, 2]];
    const result = validateExercise("matching", content, answer);
    expect(result).toEqual({ success: true, data: { content, answer } });
  });

  it("hợp lệ: nối xáo trộn", () => {
    expect(validateExercise("matching", content, [[0, 2], [1, 0], [2, 1]]).success).toBe(true);
  });

  it("sai: thiếu field", () => {
    expectError("matching", { left: ["a", "b"] }, [[0, 0], [1, 1]], "content.right", "bắt buộc");
  });

  it("sai: khác độ dài left/right", () => {
    expectError(
      "matching",
      { left: ["a", "b", "c"], right: ["x", "y"] },
      [[0, 0], [1, 1]],
      "content.right",
      "cùng độ dài"
    );
  });

  it("sai: phần tử rỗng / sai kiểu", () => {
    expectError("matching", { left: ["a", ""], right: ["x", "y"] }, [[0, 0], [1, 1]], "content.left[1]", "không được để trống");
    expectError("matching", { left: "ab", right: ["x", "y"] }, [[0, 0], [1, 1]], "content.left", "phải là một mảng");
  });

  it("sai: số cặp không bằng left.length", () => {
    expectError("matching", content, [[0, 0], [1, 1]], "answer", "số mục của cột trái");
  });

  it("sai: chỉ số trái ngoài phạm vi", () => {
    expectError("matching", content, [[0, 0], [1, 1], [3, 2]], "answer[2][0]", "từ 0 đến 2");
  });

  it("sai: chỉ số phải ngoài phạm vi", () => {
    expectError("matching", content, [[0, 0], [1, 1], [2, 5]], "answer[2][1]", "từ 0 đến 2");
  });

  it("sai: cặp nối trùng chỉ số trái", () => {
    expectError("matching", content, [[0, 0], [0, 1], [2, 2]], "answer[1][0]", "bị dùng nhiều lần");
  });

  it("sai: cặp nối trùng chỉ số phải", () => {
    expectError("matching", content, [[0, 1], [1, 1], [2, 2]], "answer[1][1]", "bị dùng nhiều lần");
  });

  it("sai: cặp có độ dài khác 2 / sai kiểu", () => {
    expectError("matching", content, [[0], [1, 1], [2, 2]], "answer[0]", "ít nhất 2 phần tử");
    expectError("matching", content, [[0, 1, 2], [1, 0], [2, 2]], "answer[0]", "vượt quá 2 phần tử");
    expectError("matching", content, [["0", 0], [1, 1], [2, 2]], "answer[0][0]", "phải là số");
  });

  it("sai: thiếu answer", () => {
    expectError("matching", content, undefined, "answer", "bắt buộc phải có đáp án");
  });
});

// ===========================================================================
describe("error_correction", () => {
  const content = { sentence: "He go to school.", wrong: "go" };

  it("hợp lệ (đầy đủ = tối giản)", () => {
    const result = validateExercise("error_correction", content, ["goes"]);
    expect(result).toEqual({ success: true, data: { content, answer: ["goes"] } });
  });

  it("sai: thiếu field", () => {
    expectError("error_correction", { sentence: "He go." }, ["goes"], "content.wrong", "bắt buộc");
  });

  it("sai: chuỗi rỗng / sai kiểu", () => {
    expectError("error_correction", { sentence: "He go.", wrong: " " }, ["goes"], "content.wrong", "không được để trống");
    expectError("error_correction", { sentence: 1, wrong: "go" }, ["goes"], "content.sentence", "phải là chuỗi");
  });

  it("sai: wrong không nằm trong sentence", () => {
    expectError(
      "error_correction",
      { sentence: "He go to school.", wrong: "went" },
      ["goes"],
      "content.wrong",
      "xuất hiện nguyên văn"
    );
  });

  it("sai: answer có 0 hoặc 2 phần tử", () => {
    expectError("error_correction", content, [], "answer", "đúng 1 phần tử");
    expectError("error_correction", content, ["goes", "went"], "answer", "đúng 1 phần tử");
  });

  it("sai: bản sửa giống phần sai (không phân biệt hoa/thường)", () => {
    expectError("error_correction", content, ["GO"], "answer[0]", "không được giống");
  });

  it("sai: thiếu answer", () => {
    expectError("error_correction", content, undefined, "answer", "bắt buộc phải có đáp án");
  });
});

// ===========================================================================
describe("listening_fill", () => {
  const content = { script: "I get up at seven and take the bus.", blanks: 2 };

  it("hợp lệ (đầy đủ = tối giản)", () => {
    const result = validateExercise("listening_fill", content, ["seven", "bus"]);
    expect(result).toEqual({ success: true, data: { content, answer: ["seven", "bus"] } });
  });

  it("sai: thiếu field", () => {
    expectError("listening_fill", { blanks: 1 }, ["a"], "content.script", "bắt buộc");
    expectError("listening_fill", { script: "Hello." }, ["a"], "content.blanks", "bắt buộc");
  });

  it("sai: chuỗi rỗng / sai kiểu / blanks không hợp lệ", () => {
    expectError("listening_fill", { script: " ", blanks: 1 }, ["a"], "content.script", "không được để trống");
    expectError("listening_fill", { script: "Hi.", blanks: "2" }, ["a"], "content.blanks", "phải là số");
    expectError("listening_fill", { script: "Hi.", blanks: 0 }, ["a"], "content.blanks", "từ 1 trở lên");
    expectError("listening_fill", { script: "Hi.", blanks: 1.5 }, ["a"], "content.blanks", "số nguyên");
  });

  it("sai: độ dài answer không khớp blanks", () => {
    expectError("listening_fill", content, ["seven"], "answer", "blanks (2)");
    expectError("listening_fill", content, ["a", "b", "c"], "answer", "blanks (2)");
  });

  it("sai: phần tử answer rỗng", () => {
    expectError("listening_fill", content, ["seven", " "], "answer[1]", "không được để trống");
  });

  it("sai: thiếu answer", () => {
    expectError("listening_fill", content, undefined, "answer", "bắt buộc phải có đáp án");
  });
});

// ===========================================================================
describe("writing", () => {
  const content = { prompt: "Write about your family.", minWords: 80 };

  it("hợp lệ với answer = null", () => {
    expect(validateExercise("writing", content, null)).toEqual({
      success: true,
      data: { content, answer: null },
    });
  });

  it("hợp lệ tối giản: không truyền answer (ra null)", () => {
    expect(validateExercise("writing", content, undefined)).toEqual({
      success: true,
      data: { content, answer: null },
    });
  });

  it("sai: thiếu field / chuỗi rỗng / sai kiểu", () => {
    expectError("writing", { minWords: 50 }, null, "content.prompt", "bắt buộc");
    expectError("writing", { prompt: " ", minWords: 50 }, null, "content.prompt", "không được để trống");
    expectError("writing", { prompt: "Write.", minWords: "50" }, null, "content.minWords", "phải là số");
  });

  it("sai: minWords <= 0", () => {
    expectError("writing", { prompt: "Write.", minWords: 0 }, null, "content.minWords", "lớn hơn 0");
    expectError("writing", { prompt: "Write.", minWords: -3 }, null, "content.minWords", "lớn hơn 0");
  });

  it("sai: có answer", () => {
    expectError("writing", content, ["model essay"], "answer", "không có đáp án");
    expectError("writing", content, "text", "answer", "không có đáp án");
    expectError("writing", content, "", "answer", "không có đáp án");
  });
});

// ===========================================================================
describe("speaking", () => {
  it("hợp lệ đầy đủ (có sample)", () => {
    const content = { prompt: "Introduce yourself.", sample: "My name is An." };
    expect(validateExercise("speaking", content, null)).toEqual({
      success: true,
      data: { content, answer: null },
    });
  });

  it("hợp lệ tối giản (không sample, không answer)", () => {
    const content = { prompt: "Talk about your hobby." };
    expect(validateExercise("speaking", content, undefined)).toEqual({
      success: true,
      data: { content, answer: null },
    });
  });

  it("sai: thiếu prompt / chuỗi rỗng / sai kiểu", () => {
    expectError("speaking", {}, null, "content.prompt", "bắt buộc");
    expectError("speaking", { prompt: " " }, null, "content.prompt", "không được để trống");
    expectError("speaking", { prompt: 9 }, null, "content.prompt", "phải là chuỗi");
    expectError("speaking", { prompt: "Talk.", sample: "  " }, null, "content.sample", "không được để trống");
  });

  it("sai: có answer", () => {
    expectError("speaking", { prompt: "Talk." }, ["hello"], "answer", "không có đáp án");
  });
});

// ===========================================================================
describe("type không hợp lệ", () => {
  it("type không tồn tại: lỗi rõ ràng, liệt kê dạng hợp lệ", () => {
    const errors = errorsOf("essay", { prompt: "x" }, null);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe("type");
    expect(errors[0].message).toContain("Dạng bài không hợp lệ");
    expect(errors[0].message).toContain("multiple_choice");
  });

  it("type thiếu / sai kiểu / rỗng", () => {
    expect(validateExercise(undefined, {}, null).success).toBe(false);
    expect(validateExercise(null, {}, null).success).toBe(false);
    expect(validateExercise(5, {}, null).success).toBe(false);
    expect(validateExercise("", {}, null).success).toBe(false);
  });
});

// ===========================================================================
describe("lỗi mặc định của Zod được Việt hóa và có path", () => {
  it("content không phải object", () => {
    expectError("fill_blank", "text", ["a"], "content", "Sai kiểu dữ liệu: cần đối tượng");
    expectError("fill_blank", null, ["a"], "content", "Sai kiểu dữ liệu");
    expectError("fill_blank", [], ["a"], "content", "Sai kiểu dữ liệu");
  });

  it("thiếu content", () => {
    expectError("fill_blank", undefined, ["a"], "content", "Thiếu dữ liệu bắt buộc");
  });

  it("field thừa trong content", () => {
    expectError("speaking", { prompt: "Talk.", extra: 1 }, null, "content", "Có field không được phép: extra");
  });

  it("cặp nối thiếu/thừa phần tử có thông báo tiếng Việt", () => {
    const content = { left: ["a", "b"], right: ["x", "y"] };
    expectError("matching", content, [[0], [1, 1]], "answer[0]", "Cần ít nhất 2 phần tử");
    expectError("matching", content, [[0, 0, 0], [1, 1]], "answer[0]", "Không được vượt quá 2 phần tử");
  });

  it("answer sai kiểu (không phải mảng)", () => {
    expectError("fill_blank", { text: "I ___ ok." }, "am", "answer", "phải là một mảng");
  });

  it("nhiều lỗi cùng lúc: báo đủ cả content và answer, không có lỗi kiểm tra chéo thừa", () => {
    const errors = errorsOf("fill_blank", { text: "   " }, [""]);
    const paths = errors.map((e) => e.path).sort();
    expect(paths).toEqual(["answer[0]", "content.text"]);
    for (const e of errors) {
      expect(e.message).toMatch(/[ạảãàáâấầẩẫậăắằẳẵặẹẻẽèéêếềểễệịỉĩìíọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựỳỵỷỹý]|bắt buộc|trống/i);
    }
  });
});