/** T19 (bước 2): cleanupExpiredAudio. Thư mục tạm riêng cho test, dọn sau mỗi test. Không cần DB. */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpDir } = vi.hoisted(() => ({
  tmpDir: `${process.env.TMPDIR ?? "/tmp"}/t19-cleanup-${process.pid}-${Date.now()}`,
}));
vi.mock("../../config/env", () => ({
  env: { AUDIO_TMP_DIR: tmpDir, AUDIO_MAX_BYTES: 10 * 1024 * 1024 },
}));

import { cleanupExpiredAudio } from "./attempts.audio.cleanup";

const TTL = 60 * 60 * 1000; // 60 phút
const NOW = new Date("2026-11-19T12:00:00.000Z");
const U1 = "3f2b8c1e-9d4a-4b6f-8a1c-0e5d7f9a2b3c";
const U2 = "4a1c9d2e-8b3f-4c7a-9e2d-1f6a8b0c3d4e";
const U3 = "5b2d0e3f-9c4a-4d8b-8f3e-2a7b9c1d4e5f";

const put = (name: string, ageMs: number, dir = tmpDir) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, "x");
  const when = new Date(NOW.getTime() - ageMs);
  fs.utimesSync(file, when, when);
  return file;
};
const names = () => fs.readdirSync(tmpDir).sort();
const run = () => cleanupExpiredAudio({ now: NOW, ttlMs: TTL });

beforeEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("cleanupExpiredAudio: quá hạn / còn hạn", () => {
  it("file quá TTL bị xóa, file mới giữ nguyên", async () => {
    put(`7__${U1}.webm`, TTL + 5 * 60_000);
    put(`7__${U2}.mp3`, 60_000);
    const result = await run();
    expect(result).toEqual({ scanned: 2, deleted: 1, failed: 0 });
    expect(names()).toEqual([`7__${U2}.mp3`]);
  });

  it("sát biên: đúng TTL còn giữ; hơn TTL 1 giây thì xóa; thiếu 1 giây còn giữ", async () => {
    put(`7__${U1}.webm`, TTL); // đúng TTL
    put(`7__${U2}.webm`, TTL + 1000); // hơn 1 giây
    put(`7__${U3}.webm`, TTL - 1000); // thiếu 1 giây
    await run();
    expect(names()).toEqual([`7__${U1}.webm`, `7__${U3}.webm`].sort());
  });

  it("mtime ở tương lai thì giữ", async () => {
    put(`7__${U1}.webm`, -10 * 60_000);
    await run();
    expect(names()).toEqual([`7__${U1}.webm`]);
  });

  it("file đã claim bị bỏ rơi (.claimed) quá hạn cũng bị xóa; còn hạn thì giữ", async () => {
    put(`7__${U1}.wav.claimed`, TTL + 60_000);
    put(`7__${U2}.wav.claimed`, 1000);
    await run();
    expect(names()).toEqual([`7__${U2}.wav.claimed`]);
  });
});

describe("cleanupExpiredAudio: chỉ đụng file do server đặt", () => {
  it("file lạ không khớp mẫu tên không bị xóa dù rất cũ", async () => {
    const strange = [
      "notes.txt", ".gitkeep", `7__${U1}.ogg`, `7__${U1}.webm.bak`, `7__${U1}.webm.claimed.bak`,
      `abc__${U1}.webm`, `7_${U1}.webm`, "7__not-a-uuid.webm", `__${U1}.webm`,
    ];
    for (const name of strange) put(name, 365 * 24 * 3600_000);
    const result = await run();
    expect(result).toEqual({ scanned: 0, deleted: 0, failed: 0 });
    expect(names()).toEqual([...strange].sort());
  });

  it("thư mục con (kể cả tên khớp mẫu) không bị xóa và không bị đi vào", async () => {
    const sub = path.join(tmpDir, `7__${U1}.webm`);
    fs.mkdirSync(sub);
    const inner = put(`7__${U2}.webm`, TTL * 5, sub);
    const other = path.join(tmpDir, "sub");
    fs.mkdirSync(other);
    const inner2 = put(`7__${U3}.webm`, TTL * 5, other);
    const result = await run();
    expect(result.deleted).toBe(0);
    expect(fs.existsSync(inner)).toBe(true);
    expect(fs.existsSync(inner2)).toBe(true);
  });

  it("symlink tên khớp mẫu: không xóa link, không xóa file đích", async (ctx) => {
    const outsideDir = fs.mkdtempSync(`${tmpDir}-outside-`);
    try {
      const target = path.join(outsideDir, "precious.txt");
      fs.writeFileSync(target, "keep me");
      const old = new Date(NOW.getTime() - TTL * 5);
      fs.utimesSync(target, old, old);
      const link = path.join(tmpDir, `7__${U1}.webm`);
      try {
        fs.symlinkSync(target, link);
      } catch {
        ctx.skip(); // Windows không có quyền tạo symlink
        return;
      }
      const result = await run();
      expect(result.deleted).toBe(0);
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(target, "utf8")).toBe("keep me");
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

describe("cleanupExpiredAudio: thư mục và lỗi", () => {
  it("thư mục chưa tồn tại: không lỗi, không log", async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(run()).resolves.toEqual({ scanned: 0, deleted: 0, failed: 0 });
    expect(logs).not.toHaveBeenCalled();
  });

  it("một file lỗi xóa (EPERM) không chặn các file còn lại; log chỉ có mã, không có tên file/đường dẫn", async () => {
    put(`7__${U1}.webm`, TTL * 2);
    put(`7__${U2}.webm`, TTL * 2);
    put(`7__${U3}.webm`, TTL * 2);
    const realUnlink = fs.promises.unlink.bind(fs.promises);
    vi.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
      if (String(p).includes(U2)) throw Object.assign(new Error(`EPERM ${String(p)}`), { code: "EPERM" });
      return realUnlink(p);
    });
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await run();

    expect(result).toEqual({ scanned: 3, deleted: 2, failed: 1 });
    expect(names()).toEqual([`7__${U2}.webm`]);
    const logged = JSON.stringify(logs.mock.calls);
    expect(logged).toContain("AUDIO_DELETE_FAILED");
    for (const secret of [tmpDir, U1, U2, U3, ".webm"]) expect(logged).not.toContain(secret);
  });

  it("file đã mất giữa chừng (ENOENT khi xóa): không tính lỗi, không log", async () => {
    put(`7__${U1}.webm`, TTL * 2);
    vi.spyOn(fs.promises, "unlink").mockRejectedValue(Object.assign(new Error("gone"), { code: "ENOENT" }));
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(run()).resolves.toEqual({ scanned: 1, deleted: 0, failed: 0 });
    expect(logs).not.toHaveBeenCalled();
  });

  it("không đọc được thư mục (EACCES): không ném lỗi, chỉ log mã", async () => {
    vi.spyOn(fs.promises, "readdir").mockRejectedValue(
      Object.assign(new Error(`EACCES ${tmpDir}`), { code: "EACCES" })
    );
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(run()).resolves.toEqual({ scanned: 0, deleted: 0, failed: 0 });
    expect(JSON.stringify(logs.mock.calls)).toContain("AUDIO_CLEANUP_FAILED");
    expect(JSON.stringify(logs.mock.calls)).not.toContain(tmpDir);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "ttlMs=%s không hợp lệ: ném RangeError và không xóa gì",
    async (ttlMs) => {
      put(`7__${U1}.webm`, TTL * 2);
      await expect(cleanupExpiredAudio({ now: NOW, ttlMs })).rejects.toThrow(RangeError);
      expect(names()).toEqual([`7__${U1}.webm`]);
    }
  );
});