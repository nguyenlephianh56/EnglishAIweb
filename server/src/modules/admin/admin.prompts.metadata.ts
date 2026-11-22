import type { PromptTemplate } from "@prisma/client";
import { DEFAULT_PROMPTS, PROMPT_KEYS, type PromptDefinition } from "../../ai/prompts/defaults";

type StoredPrompt = Pick<PromptTemplate, "key" | "template" | "updatedAt">;

export function toPromptMetadata(definition: PromptDefinition, row: StoredPrompt | undefined) {
  return {
    key: definition.key,
    task: definition.task,
    variables: definition.variables,
    required: definition.required,
    is_default: row === undefined || row.template === definition.template,
    updated_at: row?.updatedAt ?? null,
  };
}

export function buildPromptMetadataList(rows: readonly StoredPrompt[]) {
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  return PROMPT_KEYS.map((key) => toPromptMetadata(DEFAULT_PROMPTS[key], rowsByKey.get(key)));
}