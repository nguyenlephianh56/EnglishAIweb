/**
 * T17 bước 1: test đơn vị (không cần DB, không cần server).
 * - Nhận diện định dạng bằng magic bytes (webm, mp3 ID3, mp3 frame sync, wav).
 * - Chuẩn hóa mimetype (chấp nhận hậu tố "; codecs=opus"), kiểm đuôi file.
 * - Cấu hình thư mục tạm: tương thích Windows, tự tạo, nằm trong server/.
 */

import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  AUDIO_HEADER_BYTES,
  declaredAudioFormat,
  detectAudioFormat,
  formatFromFilename,
  formatFromMime,
  normalizeMime,
} from "./attempts.audio.magic";
import {
  AUDIO_FIELD_NAME,
  ensureAudioTmpDir,
  getAudioTmpDir,
} from "./attempts.audio.config";

const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
const MP3_ID3 = Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00", "latin1");
const MP3_SYNC = Buffer.from([0xff, 0xfb, 0x90, 0x44, 0x00, 0x00]);
const WAV = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WAVE", "latin1"),
  Buffer.from("fmt ", "latin1"),
]);

describe("detectAudioFormat (magic bytes)", () => {
  it("nhận webm, mp3 (ID3), mp3 (frame sync), wav", () => {
    expect(detectAudioFormat(WEBM)).toBe("webm");
    expect(detectAudioFormat(MP3_ID3)).toBe("mp3");
    expect(detectAudioFormat(MP3_SYNC)).toBe("mp3");
    expect(detectAudioFormat(WAV)).toBe("wav");
  });

  it("chỉ cần đọc AUDIO_HEADER_BYTES byte đầu là đủ", () => {
    expect(AUDIO_HEADER_BYTES).toBe(12);
    expect(detectAudioFormat(WAV.subarray(0, AUDIO_HEADER_BYTES))).toBe("wav");
  });

  it("văn bản, rỗng, quá ngắn -> null", () => {
    expect(detectAudioFormat(Buffer.from("hello, this is not audio"))).toBeNull();
    expect(detectAudioFormat(Buffer.alloc(0))).toBeNull();
    expect(detectAudioFormat(Buffer.from([0x1a, 0x45]))).toBeNull();
  });

  it("png và ogg -> null (định dạng khác)", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const ogg = Buffer.from("OggS\x00\x02\x00\x00\x00\x00\x00\x00", "latin1");
    expect(detectAudioFormat(png)).toBeNull();
    expect(detectAudioFormat(ogg)).toBeNull();
  });

  it("RIFF nhưng không phải WAVE (vd AVI) -> null", () => {
    const avi = Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("AVI ", "latin1"),
    ]);
    expect(detectAudioFormat(avi)).toBeNull();
  });

  it("FF Fx với layer = 00 (AAC/ADTS) -> null; FF E? không phải FF Fx -> null", () => {
    expect(detectAudioFormat(Buffer.from([0xff, 0xf1, 0x50, 0x80]))).toBeNull();
    expect(detectAudioFormat(Buffer.from([0xff, 0xe3, 0x90, 0x44]))).toBeNull();
  });
});

describe("mimetype và đuôi file", () => {
  it("chuẩn hóa: bỏ hậu tố, chữ thường, trim", () => {
    expect(normalizeMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeMime("  Audio/WebM ; codecs=opus ")).toBe("audio/webm");
    expect(normalizeMime(undefined)).toBe("");
  });

  it("mimetype hợp lệ", () => {
    expect(formatFromMime("audio/webm;codecs=opus")).toBe("webm");
    expect(formatFromMime("audio/mpeg")).toBe("mp3");
    expect(formatFromMime("audio/x-wav")).toBe("wav");
    expect(formatFromMime("audio/ogg")).toBeNull();
    expect(formatFromMime("image/png")).toBeNull();
    expect(formatFromMime("text/plain")).toBeNull();
  });

  it("đuôi file: không phân biệt hoa/thường, lấy đuôi cuối, bỏ thư mục", () => {
    expect(formatFromFilename("voice.WEBM")).toBe("webm");
    expect(formatFromFilename("a.b.mp3")).toBe("mp3");
    expect(formatFromFilename("../../x.mp3")).toBe("mp3");
    expect(formatFromFilename("C:\\tmp\\x.wav")).toBe("wav");
    expect(formatFromFilename("x.mp3.exe")).toBeNull();
    expect(formatFromFilename("noext")).toBeNull();
    expect(formatFromFilename("x.ogg")).toBeNull();
    expect(formatFromFilename(undefined)).toBeNull();
  });

  it("declaredAudioFormat: mimetype và đuôi phải cùng định dạng", () => {
    expect(declaredAudioFormat("audio/webm;codecs=opus", "r.webm")).toBe("webm");
    expect(declaredAudioFormat("audio/mpeg", "r.mp3")).toBe("mp3");
    expect(declaredAudioFormat("audio/webm", "r.mp3")).toBeNull();
    expect(declaredAudioFormat("audio/mpeg", "r.txt")).toBeNull();
    expect(declaredAudioFormat("text/plain", "r.mp3")).toBeNull();
  });
});

describe("cấu hình thư mục tạm", () => {
  const made: string[] = [];
  afterAll(() => {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("tên field cố định là audio", () => {
    expect(AUDIO_FIELD_NAME).toBe("audio");
  });

  it("getAudioTmpDir: đường dẫn tuyệt đối, nằm trong thư mục chạy server", () => {
    const dir = getAudioTmpDir();
    expect(path.isAbsolute(dir)).toBe(true);
    const rel = path.relative(process.cwd(), dir);
    expect(rel.startsWith("..")).toBe(false);
    expect(path.isAbsolute(rel)).toBe(false);
  });

  it("ensureAudioTmpDir: tự tạo thư mục lồng nhau, gọi lại không lỗi", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "t17cfg_"));
    made.push(root);
    const target = path.join(root, "a", "b");
    expect(fs.existsSync(target)).toBe(false);
    expect(ensureAudioTmpDir(target)).toBe(target);
    expect(fs.statSync(target).isDirectory()).toBe(true);
    expect(() => ensureAudioTmpDir(target)).not.toThrow();
  });
});