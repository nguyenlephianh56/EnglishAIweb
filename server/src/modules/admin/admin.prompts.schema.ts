import { z } from "zod";

const MAX_PROMPT_TEMPLATE_LENGTH = 20_000;

export function promptTemplateLength(template: string): number {
  return Array.from(template).length;
}

export const updatePromptTemplateBodySchema = z.object({
  template: z.string()
    .min(1, "template phải có ít nhất 1 ký tự")
    .refine((template) => promptTemplateLength(template) <= MAX_PROMPT_TEMPLATE_LENGTH,
      `template được dài tối đa ${MAX_PROMPT_TEMPLATE_LENGTH} ký tự`)
    .refine((template) => !template.includes("\u0000"), "template chứa ký tự NUL không hợp lệ"),
}).strict();

export const resetPromptTemplateBodySchema = z.object({}).strict().default({});

export type UpdatePromptTemplateBody = z.infer<typeof updatePromptTemplateBodySchema>;