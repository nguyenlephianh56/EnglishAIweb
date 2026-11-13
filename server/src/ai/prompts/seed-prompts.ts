// =====================================================================
// ai/prompts/seed-prompts.ts — Seed các mẫu prompt mặc định vào bảng prompt_templates (T10, bước 4).
//
//   seedPromptTemplates(db): duyệt DEFAULT_PROMPTS, mỗi key upsert một bản ghi.
//   - update: {}  -> mẫu ĐÃ CÓ trong DB (admin có thể đã sửa) KHÔNG bị ghi đè.
//   - Chạy nhiều lần an toàn (idempotent): không tạo trùng key.
//   - Không log nội dung mẫu, không đọc env/secret.
//
// File này KHÔNG tự chạy gì khi import (khác prisma/seed.ts) nên test import được.
// =====================================================================

import { DEFAULT_PROMPTS, PROMPT_KEYS } from "./defaults";

/** Kiểu "DB tối thiểu" để test bằng DB giả (PrismaClient thật gán vào được). */
export interface PromptSeedDb {
  promptTemplate: {
    upsert(args: {
      where: { key: string };
      update: Record<string, never>;
      create: { key: string; template: string };
    }): Promise<unknown>;
  };
}

/** Tạo các mẫu mặc định còn thiếu. Trả về danh sách key đã xử lý (để seed.ts in ra). */
export async function seedPromptTemplates(db: PromptSeedDb): Promise<string[]> {
  const processed: string[] = [];

  for (const key of PROMPT_KEYS) {
    await db.promptTemplate.upsert({
      where: { key },
      update: {},
      create: { key, template: DEFAULT_PROMPTS[key].template },
    });
    processed.push(key);
  }

  return processed;
}