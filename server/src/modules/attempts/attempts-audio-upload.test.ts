/**
 * T17 bước 3: test phần nhận file (multer) + kiểm tra sau khi ghi + resolveAudioPath.
 * Dùng một app Express nhỏ: giả req.user (HS id 7), gắn receiveAudioFile + verifyUploadedAudio +
 * errorHandler THẬT, gửi multipart thật qua HTTP. Không cần DB (phần quyền/bài ở test bước 4).
 *
 * - Thư mục tạm và giới hạn dung lượng đặt qua biến môi trường TRƯỚC khi import code (env.ts đọc
 *   một lần lúc import): thư mục riêng trong thư mục tạm của hệ điều hành, giới hạn 1024 byte.
 * - Dọn thư mục sau mỗi test và sau cả file test.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import type { AddressInfo } from "net";
import express from "express";

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "t17upl_"));
const TMP_DIR = path.join(SANDBOX, "audio");
const OUTSIDE_DIR = path.join(SANDBOX, "outside"); // chỗ "thoát" nếu có lỗi path traversal
const MAX = 1024;
const STUDENT_ID = 7;

process.env.AUDIO_TMP_DIR = TMP_DIR;
process.env.AUDIO_MAX_BYTES = String(MAX);
// env.ts bắt buộc có hai biến này; test không dùng DB nên giá trị giả là đủ khi .env chưa có.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-test-secret-123";

let server: Server;
let baseUrl = "";
let resolveAudioPath: (studentId: number, audioId: string) => string | null;

// Magic bytes đúng cho từng định dạng, đệm tới `size` byte.
const pad = (head: Buffer, size = 64) =>
  Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 0x11)]);
const WEBM = (size?: number) => pad(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), size);
const MP3_ID3 = (size?: number) => pad(Buffer.from("ID3\x03\x00\x00", "latin1"), size);
const MP3_SYNC = (size?: number) => pad(Buffer.from([0xff, 0xfb, 0x90, 0x44]), size);
const WAV = (size?: number) =>
  pad(
    Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.from([0x24, 0, 0, 0]),
      Buffer.from("WAVE", "latin1"),
    ]),
    size
  );

interface Part {
  field?: string;
  data: Buffer;
  type: string;
  filename: string;
}

const upload = async (parts: Part[]) => {
  const form = new FormData();
  for (const p of parts) {
    form.append(p.field ?? "audio", new Blob([new Uint8Array(p.data)], { type: p.type }), p.filename);
  }
  const res = await fetch(`${baseUrl}/up`, { method: "POST", body: form });
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) };
};

const filesInTmp = () => (fs.existsSync(TMP_DIR) ? fs.readdirSync(TMP_DIR) : []);

beforeAll(async () => {
  fs.mkdirSync(OUTSIDE_DIR, { recursive: true });

  const { receiveAudioFile, verifyUploadedAudio, resolveAudioPath: resolver } = await import(
    "./attempts.audio.upload"
  );
  const { errorHandler } = await import("../../middlewares/errorHandler");
  resolveAudioPath = resolver;

  const app = express();
  app.post(
    "/up",
    (req, _res, next) => {
      req.user = { id: STUDENT_ID, role: "STUDENT", status: "ACTIVE" } as never;
      next();
    },
    receiveAudioFile,
    async (req, res, next) => {
      try {
        res.status(201).json({ data: await verifyUploadedAudio(req), error: null });
      } catch (error) {
        next(error);
      }
    }
  );
  app.use(errorHandler);

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

describe("đúng: webm, mp3 (ID3 và frame sync), wav", () => {
  const cases: Array<[string, Buffer, string, string, string]> = [
    ["webm (kèm codecs)", WEBM(), "audio/webm;codecs=opus", "voice.webm", "audio/webm"],
    ["mp3 ID3", MP3_ID3(), "audio/mpeg", "voice.mp3", "audio/mpeg"],
    ["mp3 frame sync", MP3_SYNC(), "audio/mpeg", "voice.MP3", "audio/mpeg"],
    ["wav", WAV(), "audio/wav", "voice.wav", "audio/wav"],
  ];

  it.each(cases)("%s -> 201, file có trong thư mục tạm, tên do server đặt", async (_n, data, type, filename, mime) => {
    const r = await upload([{ data, type, filename }]);

    expect(r.status).toBe(201);
    expect(r.json.error).toBeNull();
    expect(Object.keys(r.json.data).sort()).toEqual(["audio_id", "mime", "size_bytes"]);
    expect(r.json.data.mime).toBe(mime);
    expect(r.json.data.size_bytes).toBe(data.length);

    const files = filesInTmp();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(
      new RegExp(`^${STUDENT_ID}__[0-9a-f-]{36}\\.(webm|mp3|wav)$`)
    );
    expect(files[0]).toContain(r.json.data.audio_id);
    expect(files[0]).not.toContain("voice");

    // Response không lộ đường dẫn máy chủ hay tên file gốc.
    expect(r.text).not.toContain(SANDBOX);
    expect(r.text).not.toContain("voice");
    expect(r.text).not.toContain(TMP_DIR);
  });
});

describe("sai định dạng / thiếu / sai field -> 400 và không còn file", () => {
  const expectRejected = (r: { status: number; json: any }, code: string, status = 400) => {
    expect(r.status).toBe(status);
    expect(r.json.data).toBeNull();
    expect(r.json.error.code).toBe(code);
    expect(typeof r.json.error.message).toBe("string");
    expect(filesInTmp()).toEqual([]);
  };

  it("đuôi .mp3, mimetype audio/mpeg nhưng nội dung là văn bản", async () => {
    const r = await upload([
      { data: Buffer.from("day khong phai am thanh, chi la van ban"), type: "audio/mpeg", filename: "x.mp3" },
    ]);
    expectRejected(r, "AUDIO_INVALID_FORMAT");
  });

  it("mimetype + đuôi hợp lệ nhưng magic bytes sai (bytes của wav khai là webm)", async () => {
    const r = await upload([{ data: WAV(), type: "audio/webm", filename: "x.webm" }]);
    expectRejected(r, "AUDIO_INVALID_FORMAT");
  });

  it("magic bytes đúng nhưng mimetype không hợp lệ", async () => {
    const r = await upload([{ data: WEBM(), type: "application/octet-stream", filename: "x.webm" }]);
    expectRejected(r, "AUDIO_INVALID_FORMAT");
  });

  it("mimetype và đuôi mỗi cái một định dạng", async () => {
    const r = await upload([{ data: WEBM(), type: "audio/webm", filename: "x.mp3" }]);
    expectRejected(r, "AUDIO_INVALID_FORMAT");
  });

  it("định dạng khác: png, ogg", async () => {
    const png = pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const ogg = pad(Buffer.from("OggS", "latin1"));
    expectRejected(await upload([{ data: png, type: "image/png", filename: "x.png" }]), "AUDIO_INVALID_FORMAT");
    expectRejected(await upload([{ data: ogg, type: "audio/ogg", filename: "x.ogg" }]), "AUDIO_INVALID_FORMAT");
  });

  it("file rỗng (0 byte)", async () => {
    const r = await upload([{ data: Buffer.alloc(0), type: "audio/webm", filename: "x.webm" }]);
    expectRejected(r, "AUDIO_INVALID_FORMAT");
  });

  it("thiếu file (multipart rỗng) và không phải multipart", async () => {
    const empty = await fetch(`${baseUrl}/up`, { method: "POST", body: new FormData() });
    expectRejected({ status: empty.status, json: await empty.json() }, "AUDIO_REQUIRED");

    const json = await fetch(`${baseUrl}/up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expectRejected({ status: json.status, json: await json.json() }, "AUDIO_REQUIRED");
  });

  it("sai tên field", async () => {
    const r = await upload([{ field: "file", data: WEBM(), type: "audio/webm", filename: "x.webm" }]);
    expectRejected(r, "AUDIO_BAD_UPLOAD");
  });

  it("2 file (cùng field) -> 400 và file đầu cũng bị xóa", async () => {
    const r = await upload([
      { data: WEBM(), type: "audio/webm", filename: "a.webm" },
      { data: WEBM(), type: "audio/webm", filename: "b.webm" },
    ]);
    expectRejected(r, "AUDIO_BAD_UPLOAD");
  });

  it("1 file đúng + 1 file ở field lạ", async () => {
    const r = await upload([
      { data: WEBM(), type: "audio/webm", filename: "a.webm" },
      { field: "extra", data: WEBM(), type: "audio/webm", filename: "b.webm" },
    ]);
    expectRejected(r, "AUDIO_BAD_UPLOAD");
  });

  it("có field chữ kèm theo", async () => {
    const form = new FormData();
    form.append("studentId", "999");
    form.append("audio", new Blob([new Uint8Array(WEBM())], { type: "audio/webm" }), "a.webm");
    const res = await fetch(`${baseUrl}/up`, { method: "POST", body: form });
    expectRejected({ status: res.status, json: await res.json() }, "AUDIO_BAD_UPLOAD");
  });
});

describe("tên file client gửi không ảnh hưởng nơi lưu", () => {
  it.each(["../../x.mp3", "..\\..\\x.mp3", "/etc/x.mp3", "C:\\x.mp3"])(
    "originalname %s không thoát khỏi thư mục tạm",
    async (name) => {
      const r = await upload([{ data: MP3_ID3(), type: "audio/mpeg", filename: name }]);

      expect(r.status).toBe(201);
      const files = filesInTmp();
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^7__[0-9a-f-]{36}\.mp3$/);
      expect(fs.readdirSync(OUTSIDE_DIR)).toEqual([]);
      expect(fs.readdirSync(SANDBOX).sort()).toEqual(["audio", "outside"]);
      expect(r.text).not.toContain("x.mp3");
    }
  );
});

describe("lỗi hệ thống tệp", () => {
  it("không tạo được thư mục tạm -> 500 AUDIO_STORAGE_ERROR, không lộ/log đường dẫn", async () => {
    fs.writeFileSync(TMP_DIR, "x"); // có TỆP trùng tên thư mục -> mkdir thất bại
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await upload([{ data: WEBM(), type: "audio/webm", filename: "a.webm" }]);

      expect(r.status).toBe(500);
      expect(r.json.data).toBeNull();
      expect(r.json.error.code).toBe("AUDIO_STORAGE_ERROR");
      expect(r.text).not.toContain(SANDBOX);
      expect(JSON.stringify(spy.mock.calls)).not.toContain(SANDBOX);
      expect(spy).toHaveBeenCalled(); // có log, nhưng chỉ mã lỗi
    } finally {
      spy.mockRestore();
    }
  });
});

describe("biên dung lượng", () => {
  it("đúng bằng giới hạn -> được", async () => {
    const r = await upload([{ data: WEBM(MAX), type: "audio/webm", filename: "a.webm" }]);
    expect(r.status).toBe(201);
    expect(r.json.data.size_bytes).toBe(MAX);
    expect(filesInTmp()).toHaveLength(1);
  });

  it("vượt 1 byte -> 413, định dạng {data, error}, không còn file dở dang", async () => {
    const r = await upload([{ data: WEBM(MAX + 1), type: "audio/webm", filename: "a.webm" }]);
    expect(r.status).toBe(413);
    expect(r.json.data).toBeNull();
    expect(r.json.error.code).toBe("AUDIO_TOO_LARGE");
    expect(filesInTmp()).toEqual([]);
  });

  it("vượt nhiều (50 KB) cũng 413 và sạch", async () => {
    const r = await upload([{ data: WEBM(50 * 1024), type: "audio/webm", filename: "a.webm" }]);
    expect(r.status).toBe(413);
    expect(filesInTmp()).toEqual([]);
  });
});

describe("resolveAudioPath (cho T18)", () => {
  it("audio_id đúng + đúng học sinh -> đường dẫn trong thư mục tạm", async () => {
    const r = await upload([{ data: WAV(), type: "audio/wav", filename: "a.wav" }]);
    const resolved = resolveAudioPath(STUDENT_ID, r.json.data.audio_id);

    expect(resolved).not.toBeNull();
    expect(path.dirname(resolved as string)).toBe(TMP_DIR);
    expect(fs.existsSync(resolved as string)).toBe(true);
  });

  it("của học sinh khác -> null", async () => {
    const r = await upload([{ data: WEBM(), type: "audio/webm", filename: "a.webm" }]);
    expect(resolveAudioPath(STUDENT_ID + 1, r.json.data.audio_id)).toBeNull();
  });

  it("audio_id sai định dạng -> null (kể cả thử đi ra ngoài thư mục)", () => {
    const bad = [
      "",
      "abc",
      "../../etc/passwd",
      "..\\..\\x",
      "7__x",
      "123e4567-e89b-12d3-a456-426614174000", // không phải UUID v4
      "123E4567-E89B-42D3-A456-426614174000", // chữ hoa
      "123e4567-e89b-42d3-a456-426614174000.webm",
      "123e4567-e89b-42d3-a456-426614174000/../x",
      "x".repeat(500),
    ];
    for (const id of bad) expect(resolveAudioPath(STUDENT_ID, id)).toBeNull();
    expect(resolveAudioPath(STUDENT_ID, undefined as never)).toBeNull();
    expect(resolveAudioPath(STUDENT_ID, 123 as never)).toBeNull();
  });

  it("studentId không hợp lệ -> null", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    for (const s of [0, -1, 1.5, Number.NaN, Infinity]) expect(resolveAudioPath(s, id)).toBeNull();
  });

  it("audio_id hợp lệ nhưng không có file -> null; file bị xóa -> null", async () => {
    expect(resolveAudioPath(STUDENT_ID, "123e4567-e89b-42d3-a456-426614174000")).toBeNull();

    const r = await upload([{ data: MP3_SYNC(), type: "audio/mpeg", filename: "a.mp3" }]);
    const p = resolveAudioPath(STUDENT_ID, r.json.data.audio_id) as string;
    fs.rmSync(p);
    expect(resolveAudioPath(STUDENT_ID, r.json.data.audio_id)).toBeNull();
  });
});