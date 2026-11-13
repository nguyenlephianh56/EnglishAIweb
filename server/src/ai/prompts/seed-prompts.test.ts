import { afterEach, describe, expect, it, vi } from "vitest";

// Không tạo PrismaClient thật khi test (giống các test T9)
vi.mock("../../config/prisma", () => ({ prisma: {} }));

import { DEFAULT_PROMPTS, PROMPT_KEYS } from "./defaults";
import { validateTemplate } from "./prompt-templates";
import { seedPromptTemplates, type PromptSeedDb } from "./seed-prompts";

/** DB giả có trạng thái: `store` là bảng prompt_templates (key -> template). upsert giống Prisma thật. */
function fakeSeedDb(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const upsert = vi.fn(
    async (args: {
      where: { key: string };
      update: Record<string, never>;
      create: { key: string; template: string };
    }) => {
      const key = args.where.key;
      if (store.has(key)) {
        // update rỗng -> không đổi gì
        return { key, template: store.get(key)! };
      }
      store.set(key, args.create.template);
      return { key, template: args.create.template };
    }
  );
  const db: PromptSeedDb = { promptTemplate: { upsert } };
  return { db, store, upsert };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("seedPromptTemplates", () => {
  it("DB trống -> tạo đủ 3 mẫu", async () => {
    const { db, store } = fakeSeedDb();

    const keys = await seedPromptTemplates(db);

    expect(keys).toEqual([...PROMPT_KEYS]);
    expect(store.size).toBe(3);
    expect([...store.keys()].sort()).toEqual([...PROMPT_KEYS].sort());
  });

  it("chạy 2 lần -> vẫn 3 bản ghi, không trùng key", async () => {
    const { db, store, upsert } = fakeSeedDb();

    await seedPromptTemplates(db);
    await seedPromptTemplates(db);

    expect(store.size).toBe(3);
    expect(upsert).toHaveBeenCalledTimes(6);
    for (const key of PROMPT_KEYS) {
      expect(store.get(key)).toBe(DEFAULT_PROMPTS[key].template);
    }
  });

  it("mẫu đã có nội dung khác -> không bị ghi đè, mẫu thiếu vẫn được tạo", async () => {
    const edited = "Mẫu do admin sửa: {{level}}";
    const { db, store } = fakeSeedDb({ writing_grade: edited });

    await seedPromptTemplates(db);

    expect(store.get("writing_grade")).toBe(edited);
    expect(store.get("exercise_generate")).toBe(DEFAULT_PROMPTS.exercise_generate.template);
    expect(store.get("listening_generate")).toBe(DEFAULT_PROMPTS.listening_generate.template);
    expect(store.size).toBe(3);
  });

  it("gọi upsert với where.key, update rỗng, create = {key, template mặc định}", async () => {
    const { db, upsert } = fakeSeedDb();

    await seedPromptTemplates(db);

    for (const key of PROMPT_KEYS) {
      expect(upsert).toHaveBeenCalledWith({
        where: { key },
        update: {},
        create: { key, template: DEFAULT_PROMPTS[key].template },
      });
    }
  });

  it("nội dung seed = DEFAULT_PROMPTS[key].template và qua validateTemplate", async () => {
    const { db, store } = fakeSeedDb();

    await seedPromptTemplates(db);

    for (const key of PROMPT_KEYS) {
      const seeded = store.get(key)!;
      expect(seeded).toBe(DEFAULT_PROMPTS[key].template);
      expect(() => validateTemplate(DEFAULT_PROMPTS[key], seeded)).not.toThrow();
    }
  });

  it("nội dung seed không chứa GEMINI_API_KEY, JWT_SECRET, passwordHash", async () => {
    const { db, store } = fakeSeedDb();

    await seedPromptTemplates(db);

    for (const template of store.values()) {
      expect(template).not.toContain("GEMINI_API_KEY");
      expect(template).not.toContain("JWT_SECRET");
      expect(template).not.toContain("passwordHash");
    }
  });

  it("không gọi console (không log nội dung mẫu)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined)
    );
    const { db } = fakeSeedDb();

    await seedPromptTemplates(db);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("lỗi DB được ném tiếp, không nuốt", async () => {
    const upsert = vi.fn().mockRejectedValue(new Error("db down"));
    const db: PromptSeedDb = { promptTemplate: { upsert } };

    await expect(seedPromptTemplates(db)).rejects.toThrow("db down");
  });
});