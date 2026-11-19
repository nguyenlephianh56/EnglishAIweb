/**
 * T19 (bước 1): vòng đời file âm thanh trong getSpeakingTranscript.
 * Gemini được mock; thư mục tạm riêng cho test, dọn sau mỗi test. Không cần DB.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpDir, runAiTaskMock } = vi.hoisted(() => ({
  tmpDir: `${process.env.TMPDIR ?? "/tmp"}/t19-audio-${process.pid}-${Date.now()}`,
  runAiTaskMock: vi.fn(),
}));
vi.mock("../../config/env", () => ({
  env: { AUDIO_TMP_DIR: tmpDir, AUDIO_MAX_BYTES: 10 * 1024 * 1024 },
}));
vi.mock("../../config/prisma", () => ({ prisma: {} }));
vi.mock("../../ai/ai.service", () => ({ runAiTask: runAiTaskMock }));

import { AIQuotaExceededError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { getSpeakingTranscript, type SpeakingTranscriptDeps } from "../../ai/speakingTranscript";

const STUDENT = 7;
const OTHER = 8;
const AUDIO_ID = "3f2b8c1e-9d4a-4b6f-8a1c-0e5d7f9a2b3c";
const deps: SpeakingTranscriptDeps = {
  promptDb: { promptTemplate: { findUnique: async () => null } },
};

const audioFile = (studentId = STUDENT, id = AUDIO_ID, ext = "webm") =>
  path.join(tmpDir, `${studentId}__${id}.${ext}`);
const putAudio = (file = audioFile()) => fs.writeFileSync(file, Buffer.from("fake-audio-bytes"));
const leftovers = () => fs.readdirSync(tmpDir);
const ok = () => runAiTaskMock.mockResolvedValue({ data: { text: "I get up at six" } });

const catchError = async (promise: Promise<unknown>) => {
  try { await promise; } catch (e) { return e as { code?: string; statusCode?: number }; }
  throw new Error("expected rejection");
};

beforeEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  runAiTaskMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("T19: xóa file sau chữ hóa", () => {
  it("thành công: trả bản chữ và KHÔNG còn file nào (kể cả bản .claimed)", async () => {
    putAudio();
    ok();
    const result = await getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps);
    expect(result).toMatchObject({ text: "I get up at six", source: "gemini" });
    expect(fs.existsSync(audioFile())).toBe(false);
    expect(leftovers()).toEqual([]);
  });

  const failures: Array<[string, () => void, string]> = [
    ["429 hết hạn mức", () => runAiTaskMock.mockRejectedValue(new AIServiceError("RATE_LIMITED", 3)), "RATE_LIMITED"],
    ["timeout", () => runAiTaskMock.mockRejectedValue(new AIServiceError("TIMEOUT", 1)), "TIMEOUT"],
    ["JSON sai sau thử lại", () => runAiTaskMock.mockRejectedValue(new AIInvalidFormatError(2)), "AI_INVALID_FORMAT"],
    ["hết lượt AI/ngày", () => runAiTaskMock.mockRejectedValue(new AIQuotaExceededError()), "AI_QUOTA_EXCEEDED"],
    [
      "bản chữ rỗng",
      () => runAiTaskMock.mockImplementation(async (input: { validateGeneratedResult: (v: { text: string }) => void }) => {
        input.validateGeneratedResult({ text: "" });
      }),
      "TRANSCRIPT_EMPTY",
    ],
    ["provider ném lỗi bất ngờ", () => runAiTaskMock.mockRejectedValue(new Error("boom")), "AI_UNAVAILABLE"],
  ];

  it.each(failures)("%s: mã lỗi không đổi và file vẫn bị xóa", async (_name, arrange, code) => {
    putAudio();
    arrange();
    const error = await catchError(getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps));
    expect(error.code).toBe(code);
    expect(leftovers()).toEqual([]);
  });

  it("file rỗng (0 byte) -> 400 AUDIO_INVALID_FORMAT, không gọi AI, file vẫn bị xóa", async () => {
    fs.writeFileSync(audioFile(), Buffer.alloc(0));
    const error = await catchError(getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps));
    expect(error.code).toBe("AUDIO_INVALID_FORMAT");
    expect(runAiTaskMock).not.toHaveBeenCalled();
    expect(leftovers()).toEqual([]);
  });
});

describe("T19: xóa thất bại không làm hỏng thao tác chính", () => {
  it("unlink ném EPERM: vẫn trả đúng kết quả, log chỉ có mã AUDIO_DELETE_FAILED, không lộ đường dẫn", async () => {
    putAudio();
    ok();
    vi.spyOn(fs.promises, "unlink").mockRejectedValue(Object.assign(new Error(`EPERM ${tmpDir}`), { code: "EPERM" }));
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps);

    expect(result.text).toBe("I get up at six");
    expect(logs).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(logs.mock.calls);
    expect(logged).toContain("AUDIO_DELETE_FAILED");
    expect(logged).not.toContain(tmpDir);
    expect(logged).not.toContain(AUDIO_ID);
    expect(leftovers()).toHaveLength(1); // file bị kẹt, job dọn sẽ xử lý sau
  });

  it("unlink ném EPERM trên đường lỗi AI: mã lỗi AI vẫn giữ nguyên", async () => {
    putAudio();
    runAiTaskMock.mockRejectedValue(new AIServiceError("RATE_LIMITED", 3));
    vi.spyOn(fs.promises, "unlink").mockRejectedValue(Object.assign(new Error("x"), { code: "EPERM" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = await catchError(getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps));
    expect(error.code).toBe("RATE_LIMITED");
  });

  it("file đã mất sẵn (ENOENT) khi xóa: không lỗi, không log", async () => {
    putAudio();
    ok();
    vi.spyOn(fs.promises, "unlink").mockRejectedValue(Object.assign(new Error("gone"), { code: "ENOENT" }));
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps)
    ).resolves.toMatchObject({ source: "gemini" });
    expect(logs).not.toHaveBeenCalled();
  });

  it("hàm xóa được tiêm ném lỗi: vẫn không làm hỏng kết quả", async () => {
    putAudio();
    ok();
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await getSpeakingTranscript(
      { studentId: STUDENT, audio_id: AUDIO_ID },
      { ...deps, deleteAudio: async () => { throw new Error("hỏng"); } }
    );
    expect(result.text).toBe("I get up at six");
    expect(JSON.stringify(logs.mock.calls)).toContain("AUDIO_DELETE_FAILED");
  });
});

describe("T19: audio_id chỉ dùng được MỘT lần", () => {
  it("lần 2 cùng audio_id -> 404 AUDIO_NOT_FOUND và không gọi AI", async () => {
    putAudio();
    ok();
    await getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps);
    const error = await catchError(getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps));
    expect(error).toMatchObject({ statusCode: 404, code: "AUDIO_NOT_FOUND" });
    expect(runAiTaskMock).toHaveBeenCalledTimes(1);
  });

  it("hai request song song cùng audio_id -> tối đa MỘT lần gọi Gemini, ca còn lại 404", async () => {
    putAudio();
    runAiTaskMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { data: { text: "I get up at six" } };
    });
    const results = await Promise.allSettled([
      getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps),
      getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 404, code: "AUDIO_NOT_FOUND" });
    expect(runAiTaskMock).toHaveBeenCalledTimes(1);
    expect(leftovers()).toEqual([]);
  });

  it("claim lỗi không phải ENOENT (EPERM) -> 500 AUDIO_STORAGE_ERROR, không gọi AI, file còn nguyên cho job dọn", async () => {
    putAudio();
    vi.spyOn(fs.promises, "rename").mockRejectedValue(Object.assign(new Error("x"), { code: "EPERM" }));
    const error = await catchError(getSpeakingTranscript({ studentId: STUDENT, audio_id: AUDIO_ID }, deps));
    expect(error).toMatchObject({ statusCode: 500, code: "AUDIO_STORAGE_ERROR" });
    expect(runAiTaskMock).not.toHaveBeenCalled();
    expect(fs.existsSync(audioFile())).toBe(true);
  });
});

describe("T19: audio_id của người khác / sai định dạng", () => {
  it("audio_id của HS khác -> 404, file của HS kia KHÔNG bị xóa/đổi tên", async () => {
    putAudio(audioFile(STUDENT));
    const error = await catchError(getSpeakingTranscript({ studentId: OTHER, audio_id: AUDIO_ID }, deps));
    expect(error).toMatchObject({ statusCode: 404, code: "AUDIO_NOT_FOUND" });
    expect(runAiTaskMock).not.toHaveBeenCalled();
    expect(leftovers()).toEqual([`${STUDENT}__${AUDIO_ID}.webm`]);
  });

  it.each(["../../etc/passwd", "abc", AUDIO_ID.toUpperCase(), `${AUDIO_ID}.webm`])(
    "audio_id sai định dạng %j -> 404, file khác không bị đụng",
    async (bad) => {
      putAudio();
      const error = await catchError(getSpeakingTranscript({ studentId: STUDENT, audio_id: bad }, deps));
      expect(error).toMatchObject({ statusCode: 404, code: "AUDIO_NOT_FOUND" });
      expect(runAiTaskMock).not.toHaveBeenCalled();
      expect(leftovers()).toEqual([`${STUDENT}__${AUDIO_ID}.webm`]);
    }
  );
});

describe("T19: nhánh transcript không đụng hệ thống file", () => {
  it("không claim, không xóa, không gọi fs, không gọi AI", async () => {
    const claimAudio = vi.fn();
    const deleteAudio = vi.fn();
    const rename = vi.spyOn(fs.promises, "rename");
    const unlink = vi.spyOn(fs.promises, "unlink");
    const result = await getSpeakingTranscript(
      { studentId: STUDENT, transcript: "I get up at six" },
      { ...deps, claimAudio, deleteAudio }
    );
    expect(result).toEqual({ text: "I get up at six", source: "client" });
    expect(claimAudio).not.toHaveBeenCalled();
    expect(deleteAudio).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(runAiTaskMock).not.toHaveBeenCalled();
  });
});