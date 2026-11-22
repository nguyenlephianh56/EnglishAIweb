import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { getPromptDefinition, PROMPT_KEYS, type PromptDefinition } from "../../ai/prompts/defaults";
import { validateTemplate } from "../../ai/prompts/prompt-templates";
import { PROMPT_NOT_FOUND_CODE, PromptError } from "../../ai/prompts/render";
import { buildPromptMetadataList, toPromptMetadata } from "./admin.prompts.metadata";
import { promptTemplateLength, type UpdatePromptTemplateBody } from "./admin.prompts.schema";

type PromptAdminDb = Pick<PrismaClient, "promptTemplate" | "$transaction">;

const promptSelect = { key: true, template: true, updatedAt: true } as const;
type PromptRow = Prisma.PromptTemplateGetPayload<{ select: typeof promptSelect }>;

function requirePromptDefinition(key: string) {
  const definition = getPromptDefinition(key);
  if (!definition) throw new PromptError(PROMPT_NOT_FOUND_CODE, "Không tìm thấy mẫu prompt");
  return definition;
}

function toPromptDetail(definition: PromptDefinition, row: PromptRow | undefined) {
  return {
    ...toPromptMetadata(definition, row),
    template: row?.template ?? definition.template,
  };
}

export async function listAdminPrompts(db: PromptAdminDb = prisma) {
  const rows = await db.promptTemplate.findMany({
    where: { key: { in: [...PROMPT_KEYS] } },
    select: promptSelect,
  });
  return buildPromptMetadataList(rows);
}

export async function getAdminPrompt(key: string, db: PromptAdminDb = prisma) {
  const definition = requirePromptDefinition(key);
  const row = await db.promptTemplate.findUnique({ where: { key: definition.key }, select: promptSelect });
  return toPromptDetail(definition, row ?? undefined);
}

async function savePrompt(
  adminId: number,
  definition: PromptDefinition,
  template: string,
  action: "prompt.update" | "prompt.reset",
  db: PromptAdminDb
) {
  const { key } = definition;

  return db.$transaction(async (tx) => {
    // Khóa theo key kể cả khi chưa có hàng. Mỗi lần ghi đọc giá trị của lần ghi trước nó.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(0, hashtext(${key}))`;
    const before = await tx.promptTemplate.findUnique({ where: { key }, select: { template: true } });
    const row = await tx.promptTemplate.upsert({
      where: { key },
      create: { key, template },
      update: before?.template === template ? {} : { template },
      select: promptSelect,
    });
    await tx.auditLog.create({
      data: {
        userId: adminId,
        action,
        detail: {
          key,
          length_before: promptTemplateLength(before?.template ?? definition.template),
          length_after: promptTemplateLength(template),
        },
      },
    });
    return toPromptDetail(definition, row);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function updateAdminPrompt(
  adminId: number,
  key: string,
  { template }: UpdatePromptTemplateBody,
  db: PromptAdminDb = prisma
) {
  const definition = requirePromptDefinition(key);
  validateTemplate(definition, template);
  return savePrompt(adminId, definition, template, "prompt.update", db);
}

export async function resetAdminPrompt(adminId: number, key: string, db: PromptAdminDb = prisma) {
  const definition = requirePromptDefinition(key);
  return savePrompt(adminId, definition, definition.template, "prompt.reset", db);
}