import { describe, expect, it } from "vitest";
import { DEFAULT_PROMPTS, PROMPT_KEYS } from "../../ai/prompts/defaults";
import { buildPromptMetadataList, toPromptMetadata } from "./admin.prompts.metadata";
import { promptTemplateLength, updatePromptTemplateBodySchema } from "./admin.prompts.schema";

describe("body cấu hình prompt", () => {
  it("giữ nguyên khoảng trắng, xuống dòng và biến của mẫu", () => {
    const template = "  Hãy xem {{ essay_text }}.\n\nTrả về JSON.  ";
    expect(updatePromptTemplateBodySchema.parse({ template })).toEqual({ template });
  });

  it("chấp nhận đúng 20.000 ký tự Unicode và từ chối ký tự thứ 20.001", () => {
    const template = "🙂".repeat(20_000);
    expect(promptTemplateLength(template)).toBe(20_000);
    expect(updatePromptTemplateBodySchema.parse({ template })).toEqual({ template });
    expect(updatePromptTemplateBodySchema.safeParse({ template: `${template}a` }).success).toBe(false);
  });

  it.each([
    {}, { template: "" }, { template: 42 }, { template: null }, { template: "a\u0000b" },
    { template: "ok", key: "writing_grade" }, { template: "ok", is_default: true },
  ])("từ chối body sai %j", (body) => {
    expect(updatePromptTemplateBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("metadata của prompt", () => {
  const definition = DEFAULT_PROMPTS.writing_grade;
  const updatedAt = new Date("2026-11-22T08:00:00.000Z");

  it("liệt kê đủ PROMPT_KEYS và dùng mặc định cho key chưa có hàng", () => {
    const rows = [
      { key: "settings:ai_daily_limits", template: '{"student":10,"teacher":20}', updatedAt },
      { key: "unknown_prompt", template: "mẫu ngoài danh sách", updatedAt },
    ];
    expect(buildPromptMetadataList(rows)).toEqual(PROMPT_KEYS.map((key) => ({
      key,
      task: DEFAULT_PROMPTS[key].task,
      variables: DEFAULT_PROMPTS[key].variables,
      required: DEFAULT_PROMPTS[key].required,
      is_default: true,
      updated_at: null,
    })));
  });

  it("không trả nội dung mẫu trong metadata và đánh dấu hàng đã chỉnh là không mặc định", () => {
    const row = { key: definition.key, template: `${definition.template}\nBổ sung hướng dẫn.`, updatedAt };
    const expected = {
      key: definition.key,
      task: definition.task,
      variables: definition.variables,
      required: definition.required,
      is_default: false,
      updated_at: updatedAt,
    };
    expect(toPromptMetadata(definition, row)).toEqual(expected);
    expect(buildPromptMetadataList([row]).find((item) => item.key === row.key)).toEqual(expected);
  });

  it("hàng có nội dung đúng mẫu mặc định giữ is_default true và có updated_at", () => {
    const row = { key: definition.key, template: definition.template, updatedAt };
    expect(toPromptMetadata(definition, row)).toMatchObject({ is_default: true, updated_at: updatedAt });
  });
});