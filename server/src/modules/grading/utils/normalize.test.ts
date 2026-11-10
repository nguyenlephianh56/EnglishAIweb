import { describe, it, expect } from "vitest";
import { normalizeText, isSameText } from "./normalize";

describe("normalizeText", () => {
  it.each([
    ["Goes", "goes"],
    ["  goes  ", "goes"],
    ["GOES", "goes"],
    ["went  to", "went to"], // gộp nhiều khoảng trắng giữa
    ["went \t\n to", "went to"], // tab, xuống dòng cũng là khoảng trắng
    ["\u00A0goes\u00A0", "goes"], // khoảng trắng không ngắt (NBSP)
    ["goes.", "goes."], // KHÔNG bỏ dấu câu
    ["color|colour", "color|colour"], // KHÔNG hiểu "|"
  ])("%j -> %j", (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it("chuẩn hóa Unicode NFC: é gõ dạng tổ hợp = é dựng sẵn", () => {
    expect(normalizeText("cafe\u0301")).toBe(normalizeText("caf\u00e9"));
  });

  it.each([null, undefined, 5, {}, [], true])(
    "giá trị không phải chuỗi (%j) -> chuỗi rỗng, không ném lỗi",
    (value) => {
      expect(normalizeText(value)).toBe("");
    }
  );
});

describe("isSameText", () => {
  it.each(["Goes", "  goes  ", "GOES", "gOeS"])("%j khớp \"goes\"", (student) => {
    expect(isSameText(student, "goes")).toBe(true);
  });

  it("đáp án GV cũng được chuẩn hóa", () => {
    expect(isSameText("goes", "  Goes ")).toBe(true);
  });

  it("\"go\" không khớp \"goes\"", () => {
    expect(isSameText("go", "goes")).toBe(false);
  });

  it("dấu câu cuối làm sai", () => {
    expect(isSameText("goes.", "goes")).toBe(false);
  });

  it.each([null, undefined, "", "   ", "\t\n", 5])(
    "bài làm bỏ trống (%j) luôn sai",
    (student) => {
      expect(isSameText(student, "goes")).toBe(false);
    }
  );

  it("bỏ trống vẫn sai kể cả khi đáp án cũng rỗng", () => {
    expect(isSameText("", "")).toBe(false);
    expect(isSameText("  ", "   ")).toBe(false);
  });
});
