/** T18: test đơn vị luồng nộp + chấm lại bài NÓI ở mức service, không cần DB/AI thật (mock hết). */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { db, tx, getTranscriptMock, gradeSpeakingMock, recomputeMock } = vi.hoisted(() => ({
  db: {
    exercise: { findFirst: vi.fn() },
    assignment: { findUnique: vi.fn() },
    classMember: { findUnique: vi.fn() },
    attempt: {
      count: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(),
      updateMany: vi.fn(), findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  tx: { attempt: { create: vi.fn(), count: vi.fn() }, $executeRaw: vi.fn() },
  getTranscriptMock: vi.fn(),
  gradeSpeakingMock: vi.fn(),
  recomputeMock: vi.fn(),
}));
vi.mock("../../config/prisma", () => ({ prisma: db }));
vi.mock("../../config/env", () => ({ env: { WRITING_MAX_WORDS: 600, WRITING_MAX_CHARS: 4000 } }));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: vi.fn() }));
vi.mock("../../ai/speakingTranscript", () => ({ getSpeakingTranscript: getTranscriptMock }));
vi.mock("../../ai/speakingGrader", () => ({ gradeSpeaking: gradeSpeakingMock }));
vi.mock("../skill-profiles/skill-profiles.recompute", () => ({ recomputeSkillProfile: recomputeMock }));

import * as refreshModule from "../skill-profiles/skill-profiles.refresh";
import { AIServiceError } from "../../ai/resilience";
import { regradeAttempt, submitAttempt } from "./attempts.service";

const realRefresh = refreshModule.refreshProfileAfterGrading;
const student = { id: 7, role: "STUDENT" } as const;
const AUDIO_ID = "3f2b8c1e-9d4a-4b6f-8a1c-0e5d7f9a2b3c";
const TEXT = "I get up at six and go to school";
const submittedAt = new Date("2026-11-15T08:00:00.000Z");
const exercise = {
  id: 11, type: "speaking", skill: "SPEAKING", level: "A2", topic: "Một ngày của em",
  content: { prompt: "Talk about your day." }, answer: null, explanation: "Gợi ý của giáo viên.",
};
const GRADED = {
  score: 7.33,
  criteria: { content: 8, fluency: 7, pronunciation: 7 },
  wordIssues: [{ word: "six", issue: "Âm /s/ chưa rõ." }],
  comment: "Bạn nói khá tốt.",
  errors: [{ type: "pronunciation", text: "six", correction: "six", explanation: "Âm /s/ chưa rõ." }],
};
const practice = { exerciseId: 11, answer: { transcript: TEXT }, mode: "practice" } as const;
const assigned = { exerciseId: 11, assignmentId: 21, answer: { transcript: TEXT }, mode: "practice" } as const;

let refreshSpy: MockInstance<typeof realRefresh>;
let committed: boolean;
let stored: Record<string, unknown>;

const setAssignment = (dueOffsetMs: number) =>
  db.assignment.findUnique.mockResolvedValue({
    id: 21, classId: 31, exerciseId: 11, dueAt: new Date(Date.now() + dueOffsetMs),
  });

beforeEach(() => {
  vi.resetAllMocks();
  committed = false;
  refreshSpy = vi.spyOn(refreshModule, "refreshProfileAfterGrading").mockImplementation(
    async (client, attemptId) => { await realRefresh(client, attemptId); }
  );
  db.exercise.findFirst.mockResolvedValue(exercise);
  setAssignment(3_600_000);
  db.classMember.findUnique.mockResolvedValue({ studentId: student.id });
  db.attempt.count.mockResolvedValue(0);
  tx.attempt.count.mockResolvedValue(0);
  tx.attempt.create.mockImplementation(async ({ data }) => ({
    id: 42, score: data.score, maxScore: data.maxScore, errors: data.errors,
    aiFeedback: null, isLate: data.isLate, submittedAt: data.submittedAt,
  }));
  db.$transaction.mockImplementation(async (work: (client: typeof tx) => Promise<unknown>) => {
    const result = await work(tx);
    committed = true;
    return result;
  });
  db.attempt.updateMany.mockResolvedValue({ count: 1 });
  db.attempt.findUnique.mockResolvedValue({ studentId: student.id, exercise: { skill: "SPEAKING" } });
  getTranscriptMock.mockImplementation(async (i: { transcript?: string }) => ({
    text: i.transcript ?? TEXT, source: i.transcript === undefined ? "gemini" : "client",
    ...(i.transcript === undefined ? { usageLogId: 55 } : {}),
  }));
  gradeSpeakingMock.mockResolvedValue(structuredClone(GRADED));
  recomputeMock.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

const noSideEffects = () => {
  expect(getTranscriptMock).not.toHaveBeenCalled();
  expect(gradeSpeakingMock).not.toHaveBeenCalled();
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(tx.attempt.create).not.toHaveBeenCalled();
  expect(db.attempt.updateMany).not.toHaveBeenCalled();
  expect(refreshSpy).not.toHaveBeenCalled();
};

describe("submitAttempt speaking - đường transcript (tự luyện)", () => {
  it("lưu answer={text}, chấm, ghi điểm, cập nhật hồ sơ SPEAKING, không gọi chữ hóa của Gemini", async () => {
    const result = await submitAttempt(student, practice);

    // Lưu: chỉ {text}, score NULL lúc lưu, max 10, server tự đặt các field.
    expect(tx.attempt.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      data: expect.objectContaining({
        studentId: 7, exerciseId: 11, answer: { text: TEXT }, score: null, maxScore: 10,
        errors: [], isLate: false,
      }),
    }));
    expect(JSON.stringify(tx.attempt.create.mock.calls[0][0])).not.toContain("audio");
    // Lấy bản chữ đúng 1 lần, nguồn FE (không có audio_id).
    expect(getTranscriptMock).toHaveBeenCalledExactlyOnceWith({ studentId: 7, transcript: TEXT });
    // Chấm đúng 1 lần, ghi điểm đúng dòng, chỉ khi chưa chấm.
    expect(gradeSpeakingMock).toHaveBeenCalledExactlyOnceWith({
      studentId: 7, content: exercise.content, transcript: { text: TEXT, source: "client" },
    });
    expect(db.attempt.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 42, score: null },
      data: {
        score: 7.33, errors: GRADED.errors,
        aiFeedback: { criteria: GRADED.criteria, comment: GRADED.comment, wordIssues: GRADED.wordIssues },
      },
    });
    // Hồ sơ: sau commit, đúng 1 lần, kỹ năng SPEAKING.
    expect(committed).toBe(true);
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
    expect(recomputeMock).toHaveBeenCalledExactlyOnceWith(db, student.id, "SPEAKING");
    // Response: có điểm, tiêu chí, nhận xét, errors; tự luyện lộ explanation; KHÔNG có answer/wordIssues.
    expect(result).toMatchObject({
      attemptId: 42, score: 7.33, maxScore: 10, graded: true,
      criteria: GRADED.criteria, comment: GRADED.comment, errors: GRADED.errors,
      explanation: exercise.explanation,
    });
    expect(result).not.toHaveProperty("answer");
    expect(result).not.toHaveProperty("wordIssues");
    expect(result).not.toHaveProperty("gradingError");
  });
});

describe("submitAttempt speaking - đường audio_id", () => {
  it("chữ hóa rồi chấm; attempt KHÔNG chứa audio_id; usageLogId đi sang bước chấm (gộp 1 dòng log)", async () => {
    const result = await submitAttempt(student, { exerciseId: 11, answer: { audio_id: AUDIO_ID }, mode: "practice" });

    expect(getTranscriptMock).toHaveBeenCalledExactlyOnceWith({ studentId: 7, audio_id: AUDIO_ID });
    expect(gradeSpeakingMock).toHaveBeenCalledExactlyOnceWith({
      studentId: 7, content: exercise.content,
      transcript: { text: TEXT, source: "gemini", usageLogId: 55 },
    });
    expect(tx.attempt.create.mock.calls[0][0].data.answer).toEqual({ text: TEXT });
    expect(JSON.stringify(tx.attempt.create.mock.calls[0][0])).not.toContain(AUDIO_ID);
    expect(JSON.stringify(db.attempt.updateMany.mock.calls[0][0])).not.toContain(AUDIO_ID);
    expect(JSON.stringify(result)).not.toContain(AUDIO_ID);
    expect(result).toMatchObject({ score: 7.33, graded: true });
  });
});

describe("submitAttempt speaking - bài giao", () => {
  it.each([
    { label: "còn hạn", due: 3_600_000, late: false, reveal: false },
    { label: "sau hạn (vẫn nhận, is_late)", due: -3_600_000, late: true, reveal: true },
  ])("$label: is_late đúng, explanation chỉ lộ sau hạn, attemptsLeft đúng", async ({ due, late, reveal }) => {
    setAssignment(due);
    tx.attempt.count.mockResolvedValue(2);
    db.attempt.count.mockResolvedValue(2);
    const result = await submitAttempt(student, assigned);

    expect(tx.attempt.create.mock.calls[0][0].data).toMatchObject({ assignmentId: 21, isLate: late });
    expect(result).toMatchObject({ score: 7.33, attemptNo: 3, attemptsLeft: 0 });
    expect(result).not.toHaveProperty("answer");
    if (reveal) expect(result).toHaveProperty("explanation", exercise.explanation);
    else expect(result).not.toHaveProperty("explanation");
    // errors của bài giao chưa hết hạn không lộ correction/explanation.
    const first = (result as unknown as { errors: Record<string, unknown>[] }).errors[0];
    if (reveal) expect(first).toHaveProperty("correction");
    else expect(first).not.toHaveProperty("correction");
  });

  it("đã đủ 3 lần: 409 ATTEMPT_LIMIT_REACHED, KHÔNG gọi AI, không lưu", async () => {
    db.attempt.count.mockResolvedValue(3);
    await expect(submitAttempt(student, assigned)).rejects.toMatchObject({
      statusCode: 409, code: "ATTEMPT_LIMIT_REACHED",
    });
    noSideEffects();
  });

  it("cạnh tranh: qua kiểm nhanh nhưng trong transaction đã đủ 3 lần -> 409, không chấm, không ghi", async () => {
    db.attempt.count.mockResolvedValue(2);
    tx.attempt.count.mockResolvedValue(3);
    await expect(submitAttempt(student, assigned)).rejects.toMatchObject({
      statusCode: 409, code: "ATTEMPT_LIMIT_REACHED",
    });
    expect(tx.attempt.create).not.toHaveBeenCalled();
    expect(gradeSpeakingMock).not.toHaveBeenCalled();
    expect(db.attempt.updateMany).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("assignmentId của bài khác -> 400, không AI, không lưu", async () => {
    db.assignment.findUnique.mockResolvedValue({
      id: 21, classId: 31, exerciseId: 99, dueAt: new Date(Date.now() + 3_600_000),
    });
    await expect(submitAttempt(student, { ...assigned, exerciseId: 11 })).rejects.toMatchObject({ statusCode: 400 });
    noSideEffects();
  });

  it("HS chưa vào lớp -> 404, không AI, không lưu", async () => {
    db.classMember.findUnique.mockResolvedValue(null);
    await expect(submitAttempt(student, assigned)).rejects.toMatchObject({ statusCode: 404 });
    noSideEffects();
  });
});

describe("submitAttempt speaking - đầu vào/quyền sai bị chặn TRƯỚC AI và TRƯỚC khi lưu", () => {
  it.each([
    ["cả hai nguồn", { audio_id: AUDIO_ID, transcript: TEXT }],
    ["không có nguồn nào", {}],
    ["field lạ (score)", { transcript: TEXT, score: 10 }],
    ["field lạ (is_late)", { transcript: TEXT, is_late: false }],
    ["dạng lưu { text }", { text: TEXT }],
    ["transcript rỗng", { transcript: "  " }],
    ["audio_id sai định dạng", { audio_id: "abc" }],
  ])("%s -> 400", async (_n, answer) => {
    await expect(submitAttempt(student, { ...practice, answer })).rejects.toMatchObject({
      statusCode: 400, code: "VALIDATION_ERROR",
    });
    noSideEffects();
  });

  it("transcript dưới 3 từ -> 422 TRANSCRIPT_TOO_SHORT, không chấm, không lưu", async () => {
    await expect(submitAttempt(student, { ...practice, answer: { transcript: "hi there" } }))
      .rejects.toMatchObject({ statusCode: 422, code: "TRANSCRIPT_TOO_SHORT" });
    expect(gradeSpeakingMock).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("audio_id của HS khác / file mất (lấy bản chữ ném 404) -> 404, không lưu, không tính lượt", async () => {
    getTranscriptMock.mockRejectedValue(Object.assign(new Error("x"), { statusCode: 404, code: "AUDIO_NOT_FOUND" }));
    await expect(submitAttempt(student, { ...practice, answer: { audio_id: AUDIO_ID } }))
      .rejects.toMatchObject({ statusCode: 404, code: "AUDIO_NOT_FOUND" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(gradeSpeakingMock).not.toHaveBeenCalled();
  });

  it("client gửi score/is_late/student_id/errors ở ngoài answer: bị bỏ qua, server tự đặt", async () => {
    await submitAttempt(student, {
      ...practice, score: 10, is_late: true, student_id: 999, errors: ["x"],
    } as never);
    expect(tx.attempt.create.mock.calls[0][0].data).toMatchObject({
      studentId: 7, score: null, isLate: false, errors: [],
    });
  });

  it("bài không tồn tại / không được làm -> 404, không AI", async () => {
    db.exercise.findFirst.mockResolvedValue(null);
    await expect(submitAttempt(student, practice)).rejects.toMatchObject({ statusCode: 404 });
    noSideEffects();
  });
});

describe("submitAttempt speaking - lỗi AI", () => {
  it.each([
    ["RATE_LIMITED", new AIServiceError("RATE_LIMITED", 1)],
    ["TIMEOUT", new AIServiceError("TIMEOUT", 1)],
    ["AI_UNAVAILABLE", new AIServiceError("AI_UNAVAILABLE", 1)],
  ])("chữ hóa lỗi (%s): ném lỗi chuẩn, KHÔNG lưu attempt, KHÔNG tính 3 lần", async (code, err) => {
    getTranscriptMock.mockRejectedValue(err);
    await expect(submitAttempt(student, { ...practice, answer: { audio_id: AUDIO_ID } })).rejects.toBe(err);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.attempt.create).not.toHaveBeenCalled();
    expect(gradeSpeakingMock).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(code).toBe((err as AIServiceError).code);
  });

  it.each(["RATE_LIMITED", "TIMEOUT", "AI_UNAVAILABLE"] as const)(
    "chấm lỗi %s sau khi đã có bản chữ: giữ attempt chờ chấm, trả gradingError (202), không ghi điểm/hồ sơ",
    async (code) => {
      gradeSpeakingMock.mockRejectedValue(new AIServiceError(code, 1));
      const result = (await submitAttempt(student, practice)) as Record<string, unknown>;

      expect(tx.attempt.create).toHaveBeenCalledTimes(1); // đã lưu (tính 1 lượt)
      expect(result.attemptId).toBe(42);
      expect(result.attempt).toMatchObject({ score: null, graded: false });
      expect(result.gradingError).toMatchObject({ code });
      expect(db.attempt.updateMany).not.toHaveBeenCalled();
      expect(refreshSpy).not.toHaveBeenCalled();
    }
  );

  it("lỗi không phải AI khi chấm (DB...) ném lại như cũ", async () => {
    const error = new Error("DB_DOWN");
    gradeSpeakingMock.mockRejectedValue(error);
    await expect(submitAttempt(student, practice)).rejects.toBe(error);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("cập nhật hồ sơ lỗi: vẫn trả kết quả chấm, chỉ log mã lỗi (không log nội dung)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recomputeMock.mockRejectedValue(Object.assign(new Error("NOI_DUNG_BI_MAT"), { code: "P2002" }));
    const result = await submitAttempt(student, practice);

    expect(result).toMatchObject({ score: 7.33, graded: true });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("NOI_DUNG_BI_MAT");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TEXT);
  });

  it("không log bản chữ", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    await submitAttempt(student, practice);
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(TEXT);
  });
});

describe("không hồi quy: dạng khác không bị ảnh hưởng", () => {
  it("fill_blank vẫn chấm tự động, không đụng bước chữ hóa/chấm Nói", async () => {
    db.exercise.findFirst.mockResolvedValue({
      id: 11, type: "fill_blank", skill: "FOUNDATION", level: "A1", topic: "t",
      content: { text: "She ___." }, answer: ["goes"], explanation: "x",
    });
    db.attempt.findUnique.mockResolvedValue({ studentId: student.id, exercise: { skill: "FOUNDATION" } });
    const result = await submitAttempt(student, { exerciseId: 11, answer: ["goes"], mode: "practice" });

    expect(result).toMatchObject({ score: 10, graded: true });
    expect(getTranscriptMock).not.toHaveBeenCalled();
    expect(gradeSpeakingMock).not.toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
  });
});

// ---------- regrade speaking ----------
const makeStored = (over: Record<string, unknown> = {}) => ({
  id: 42, assignmentId: null, answer: { text: TEXT }, score: null, maxScore: 10, errors: [],
  aiFeedback: null, teacherScore: null, isLate: false, submittedAt, assignment: null, exercise, ...over,
});

describe("regradeAttempt speaking", () => {
  beforeEach(() => {
    stored = makeStored();
    db.attempt.findFirst.mockImplementation(async () => structuredClone(stored));
    db.attempt.findUniqueOrThrow.mockImplementation(async () => stored);
    db.$queryRaw.mockResolvedValue([{ id: 42, attempt_no: 1 }]);
  });

  it("chấm lại từ bản chữ {text} đã lưu (nguồn client), ghi điểm, cập nhật hồ sơ SPEAKING; không chữ hóa, không tạo attempt", async () => {
    const result = await regradeAttempt(student, 42);

    expect(getTranscriptMock).not.toHaveBeenCalled();
    expect(gradeSpeakingMock).toHaveBeenCalledExactlyOnceWith({
      studentId: 7, content: exercise.content, transcript: { text: TEXT, source: "client" },
    });
    expect(db.attempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42, score: null }, data: expect.objectContaining({ score: 7.33 }),
    }));
    expect(tx.attempt.create).not.toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
    expect(recomputeMock).toHaveBeenCalledExactlyOnceWith(db, student.id, "SPEAKING");
    expect(result).toMatchObject({
      attemptId: 42, score: 7.33, graded: true, criteria: GRADED.criteria, comment: GRADED.comment,
    });
    expect(result).not.toHaveProperty("answer");
  });

  it("đã chấm rồi -> 409 ATTEMPT_ALREADY_GRADED, không gọi AI", async () => {
    stored = makeStored({ score: 5 });
    await expect(regradeAttempt(student, 42)).rejects.toMatchObject({ statusCode: 409, code: "ATTEMPT_ALREADY_GRADED" });
    expect(gradeSpeakingMock).not.toHaveBeenCalled();
  });

  it("dữ liệu bài làm hỏng (không có text) -> 422 ATTEMPT_DATA_INVALID, không gọi AI", async () => {
    stored = makeStored({ answer: {} });
    await expect(regradeAttempt(student, 42)).rejects.toMatchObject({ statusCode: 422, code: "ATTEMPT_DATA_INVALID" });
    expect(gradeSpeakingMock).not.toHaveBeenCalled();
  });

  it("bài của HS khác / không tồn tại -> 404", async () => {
    db.attempt.findFirst.mockResolvedValue(null);
    await expect(regradeAttempt(student, 42)).rejects.toMatchObject({ statusCode: 404 });
    expect(gradeSpeakingMock).not.toHaveBeenCalled();
  });

  it("chấm lại lỗi AI: giữ nguyên, trả gradingError, không ghi/không refresh", async () => {
    gradeSpeakingMock.mockRejectedValue(new AIServiceError("TIMEOUT", 1));
    const result = (await regradeAttempt(student, 42)) as Record<string, unknown>;
    expect(result.gradingError).toMatchObject({ code: "TIMEOUT" });
    expect(result.attempt).toMatchObject({ score: null, graded: false });
    expect(db.attempt.updateMany).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("hai lần chấm song song: lần thua (updateMany count 0) -> 409, không refresh", async () => {
    db.attempt.updateMany.mockResolvedValue({ count: 0 });
    stored = makeStored();
    db.attempt.findUniqueOrThrow.mockResolvedValue({
      score: 9, errors: [], aiFeedback: { criteria: GRADED.criteria, comment: "c", wordIssues: [] },
    });
    await expect(regradeAttempt(student, 42)).rejects.toMatchObject({ statusCode: 409, code: "ATTEMPT_ALREADY_GRADED" });
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("dạng khác (fill_blank) vẫn 400 NOT_REGRADABLE", async () => {
    stored = makeStored({ exercise: { ...exercise, type: "fill_blank" } });
    await expect(regradeAttempt(student, 42)).rejects.toMatchObject({ statusCode: 400, code: "NOT_REGRADABLE" });
    expect(gradeSpeakingMock).not.toHaveBeenCalled();
  });
});