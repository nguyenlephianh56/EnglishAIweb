import { describe, expect, it } from "vitest";
import { SPEAKING_TRANSCRIPT_MAX_CHARS } from "../../ai/speaking.constants";
import { AUDIO_ID_RE } from "./attempts.constants";
import {
  createAttemptSchema,
  speakingAttemptAnswerSchema,
  speakingSubmitRequestSchema,
} from "./attempts.schema";

// Test thuần (không DB): dạng REQUEST của answer khi nộp bài speaking.

const AUDIO_ID = "3f2b8c1e-9d4a-4b6f-8a1c-0e5d7f9a2b3c";
const parse = (value: unknown) => speakingSubmitRequestSchema.safeParse(value);

describe("speakingSubmitRequestSchema - hợp lệ", () => {
  it("nhận { audio_id } UUID v4", () => {
    const r = parse({ audio_id: AUDIO_ID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ audio_id: AUDIO_ID });
  });

  it("nhận { transcript } và trim hai đầu, giữ nguyên hoa/thường, dấu câu", () => {
    const r = parse({ transcript: "  Hello, My name is An!  \n" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ transcript: "Hello, My name is An!" });
  });

  it("transcript đúng bằng giới hạn độ dài thì pass", () => {
    expect(parse({ transcript: "a".repeat(SPEAKING_TRANSCRIPT_MAX_CHARS) }).success).toBe(true);
  });

  it("transcript vẫn pass ở lớp hình dạng dù ít từ (422 TRANSCRIPT_TOO_SHORT là việc của service)", () => {
    expect(parse({ transcript: "hi" }).success).toBe(true);
  });
});

describe("speakingSubmitRequestSchema - bị từ chối", () => {
  it.each([
    ["cả hai nguồn", { audio_id: AUDIO_ID, transcript: "I like English" }],
    ["không có nguồn nào", {}],
    ["field lạ", { transcript: "I like English", score: 10 }],
    ["field lạ is_late", { audio_id: AUDIO_ID, is_late: false }],
    ["field lạ errors", { audio_id: AUDIO_ID, errors: [] }],
    ["transcript rỗng", { transcript: "" }],
    ["transcript toàn khoảng trắng", { transcript: "   \n " }],
    ["transcript quá dài", { transcript: "a".repeat(SPEAKING_TRANSCRIPT_MAX_CHARS + 1) }],
    ["transcript không phải chuỗi", { transcript: 123 }],
    ["transcript null", { transcript: null }],
    ["audio_id sai định dạng", { audio_id: "abc" }],
    ["audio_id chứa đường dẫn", { audio_id: "../../etc/passwd" }],
    ["audio_id chữ hoa", { audio_id: AUDIO_ID.toUpperCase() }],
    ["audio_id không phải chuỗi", { audio_id: 5 }],
    ["audio_id null", { audio_id: null }],
    ["audio_id rỗng", { audio_id: "" }],
    ["answer là chuỗi", "I like English"],
    ["answer là mảng", [AUDIO_ID]],
    ["answer là null", null],
    ["answer là undefined", undefined],
  ])("%s -> lỗi", (_name, value) => {
    expect(parse(value).success).toBe(false);
  });

  it("thông báo lỗi không chép lại nội dung người dùng gửi", () => {
    const secret = "my-private-sentence-xyz";
    const r = parse({ transcript: secret, score: 9 });
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).not.toContain(secret);
  });
});

describe("tách bạch dạng request và dạng lưu", () => {
  it("request { transcript } KHÔNG hợp lệ như dạng lưu { text }, và ngược lại", () => {
    expect(speakingAttemptAnswerSchema.safeParse({ transcript: "I like English" }).success).toBe(false);
    expect(parse({ text: "I like English" }).success).toBe(false);
  });

  it("AUDIO_ID_RE dùng chung khớp UUID v4 mẫu", () => {
    expect(AUDIO_ID_RE.test(AUDIO_ID)).toBe(true);
  });
});

describe("createAttemptSchema không đổi cho các dạng khác", () => {
  it("vẫn nhận answer bất kỳ (kiểm hình dạng làm ở service theo loại bài)", () => {
    const r = createAttemptSchema.safeParse({ exerciseId: 1, answer: { audio_id: AUDIO_ID } });
    expect(r.success).toBe(true);
    const w = createAttemptSchema.safeParse({ exerciseId: 1, answer: { text: "hello" } });
    expect(w.success).toBe(true);
  });

  it("vẫn bắt buộc có answer", () => {
    expect(createAttemptSchema.safeParse({ exerciseId: 1 }).success).toBe(false);
  });
});