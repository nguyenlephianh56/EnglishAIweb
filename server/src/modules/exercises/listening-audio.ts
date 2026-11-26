import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { failure } from "../../utils/response";
import { studentVisibleAssignmentWhere } from "../assignments/assignments.service";
import { BLANK_PATTERN } from "./exercise-content.schema";
import { canViewExercise } from "./exercises.service";
import { validateExercise } from "./validate-exercise";

const MODEL = "gemini-3.8-flash-lite-tts";
const VOICE = "Kore";
const STYLE = "Clear, steady English narration for language learners.";
const directory = resolve("uploads", "listening-audio");
const pending = new Map<string, Promise<Buffer>>();

type SpeechResponse = {
  steps?: { type: string; content?: { type: string; data?: string }[] }[];
};

class ListeningAudioError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function synthesize(text: string): Promise<Buffer> {
  if (!env.GEMINI_API_KEY) {
    throw new ListeningAudioError(503, "Máy chủ chưa cấu hình GEMINI_API_KEY.");
  }

  let response: globalThis.Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        store: false,
        input: [{
          type: "user_input",
          content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: STYLE }] }],
        }],
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: { speech_config: [{ voice: VOICE }] },
      }),
    });
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
        throw new ListeningAudioError(503, "Gemini đang giới hạn lượt hoặc quá tải. Hãy thử lại sau.");
      }
      throw new ListeningAudioError(502, "Gemini chưa tạo được lời đọc cho bài này.");
    }
    const result = await response.json() as SpeechResponse;
    const part = result.steps
      ?.filter(step => step.type === "model_output")
      .flatMap(step => step.content ?? [])
      .find(item => item.type === "audio" && item.data);
    const wav = Buffer.from(part?.data ?? "", "base64");
    if (wav.length <= 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
      throw new ListeningAudioError(502, "Gemini chưa trả về file WAV hợp lệ.");
    }
    return wav;
  } catch (error) {
    if (error instanceof ListeningAudioError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ListeningAudioError(504, "Gemini phản hồi quá lâu. Hãy thử tải lời đọc lại.");
    }
    throw new ListeningAudioError(502, "Chưa nhận được lời đọc từ Gemini.");
  }
}

async function readOrCreate(path: string, text: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await mkdir(directory, { recursive: true });
  const wav = await synthesize(text);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, wav);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return wav;
}

function getAudio(text: string): Promise<Buffer> {
  const key = createHash("sha256").update(JSON.stringify([MODEL, VOICE, STYLE, text])).digest("hex");
  const existing = pending.get(key);
  if (existing) return existing;

  const task = readOrCreate(join(directory, `${key}.wav`), text).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

export function listeningAudio(scope: "exercise" | "assignment"): RequestHandler {
  return async (req, res, next) => {
    if (!req.user) {
      failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
      return;
    }

    const { id } = res.locals.params as { id: number };
    try {
      const select = { type: true, content: true, answer: true, createdById: true, status: true, inLibrary: true } as const;
      const exercise = scope === "assignment"
        ? (await prisma.assignment.findFirst({
            where: { id, ...studentVisibleAssignmentWhere(req.user.id) },
            select: { exercise: { select } },
          }))?.exercise
        : await prisma.exercise.findUnique({ where: { id }, select });

      if (exercise?.type !== "listening_fill" || (scope === "exercise" && !canViewExercise(req.user, exercise))) {
        failure(res, "NOT_FOUND", "Không tìm thấy bài nghe.", 404);
        return;
      }

      const checked = validateExercise("listening_fill", exercise.content, exercise.answer);
      if (!checked.success || (checked.data.content.script.match(BLANK_PATTERN) ?? []).length !== checked.data.answer.length) {
        failure(res, "LISTENING_SCRIPT_INVALID", "Số chỗ trống và đáp án của bài nghe phải khớp nhau.", 422);
        return;
      }

      let index = 0;
      const text = checked.data.content.script.replace(BLANK_PATTERN, () => checked.data.answer[index++]);
      const audio = await getAudio(text);
      res.set("Cache-Control", "private, no-store").type("audio/wav").send(audio);
    } catch (error) {
      if (error instanceof ListeningAudioError) {
        failure(res, "LISTENING_AUDIO_UNAVAILABLE", error.message, error.status);
        return;
      }
      next(new Error("LISTENING_AUDIO_FAILED"));
    }
  };
}