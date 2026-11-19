import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./index";
import { readWritingSamples, validateWritingSamples } from "./samples";

vi.mock("../../src/ai/gemini.provider", () => {
  throw new Error("Dry-run không được nạp Gemini provider.");
});

const fixture = {
  id: "id-kiem-thu",
  prompt: "NOI_DUNG_DE_KIEM_THU",
  text: "NOI_DUNG_BAI_KIEM_THU",
  level: "A2",
  manual_score: 6.5,
};

describe("validateWritingSamples", () => {
  it("nhận mẫu hợp lệ, đặt minWords bằng 0 nếu thiếu và giữ điểm 0 hoặc 10", () => {
    const result = validateWritingSamples([
      { ...fixture, manual_score: 0 },
      { ...fixture, id: "id-khac", minWords: 15, manual_score: 10 },
    ]);

    expect(result.rejected).toEqual([]);
    expect(result.samples).toEqual([
      { ...fixture, minWords: 0, manual_score: 0 },
      { ...fixture, id: "id-khac", minWords: 15, manual_score: 10 },
    ]);
  });

  it("báo đúng vị trí và lý do mẫu sai, giữ các mẫu hợp lệ", () => {
    const result = validateWritingSamples([
      { ...fixture, prompt: undefined },
      { ...fixture, manual_score: -0.1 },
      { ...fixture, manual_score: 10.1 },
      { ...fixture, manual_score: NaN },
      { ...fixture, manual_score: "6.5" },
      { ...fixture, text: "  " },
      fixture,
      { ...fixture, id: ` ${fixture.id} ` },
      { ...fixture, id: "id-thu-hai", level: "C1" },
      { ...fixture, id: "id-thu-hai", minWords: -1 },
      { ...fixture, id: "id-thu-hai" },
    ]);

    expect(result.samples.map(({ id }) => id)).toEqual([fixture.id, "id-thu-hai"]);
    expect(result.rejected).toEqual([
      { row: 1, reason: "thiếu prompt" },
      ...[2, 3, 4, 5].map((row) => ({ row, reason: "manual_score phải là số hữu hạn từ 0 đến 10" })),
      { row: 6, reason: "text không được rỗng" },
      { row: 8, reason: "id trùng với một mẫu hợp lệ trước đó" },
      { row: 9, reason: expect.stringContaining("level") },
      { row: 10, reason: expect.stringContaining("minWords") },
    ]);
  });

  it("báo lỗi khi JSON đầu vào có dạng object thay vì mảng", () => {
    expect(() => validateWritingSamples({ samples: [] })).toThrow("phải là một mảng");
  });
});

describe("đọc file và chạy dry-run", () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "ai-eval-"));
    path = join(directory, "writing-samples.json");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it("báo đường dẫn và mã thoát lỗi khi file thiếu", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runCli(["--dry-run"], path)).toBe(1);
    expect(error).toHaveBeenCalledWith(`Thiếu file bộ mẫu chấm tay ở ${path}.`);
  });

  it("báo JSON hỏng mà không in nội dung lỗi của file", async () => {
    await writeFile(path, fixture.text, "utf8");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runCli(["--dry-run"], path)).toBe(1);
    expect(error).toHaveBeenCalledWith(`File bộ mẫu ở ${path} không phải JSON hợp lệ.`);
  });

  it("đọc file UTF-8 có BOM, chỉ in số mẫu và lý do bỏ qua", async () => {
    await writeFile(path, `\uFEFF${JSON.stringify([fixture, { ...fixture, text: "" }])}`, "utf8");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect((await readWritingSamples(path)).samples).toHaveLength(1);
    expect(await runCli(["--dry-run"], path)).toBe(0);
    expect(log.mock.calls.flat()).toEqual([
      "Mẫu hợp lệ 1. Mẫu bỏ qua 1.",
      "Mẫu số 2 bị bỏ qua (text không được rỗng).",
    ]);
  });

  it("thông báo rõ khi không có mẫu nào hợp lệ", async () => {
    await writeFile(path, JSON.stringify([{ ...fixture, manual_score: "NaN" }]), "utf8");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runCli(["--dry-run"], path)).toBe(0);
    expect(log).toHaveBeenCalledWith("Mẫu hợp lệ 0. Mẫu bỏ qua 1.");
    expect(log).toHaveBeenCalledWith("Không có mẫu hợp lệ trong bộ mẫu.");
  });
});