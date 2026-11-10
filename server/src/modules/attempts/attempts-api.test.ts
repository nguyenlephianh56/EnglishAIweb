import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import type { Prisma } from "@prisma/client";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const PREFIX = "t4a_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const users = { admin: 0, teacher: 0, student: 0 };

// id các bài tập dùng trong test (tạo trực tiếp bằng Prisma để chủ động trạng thái)
const ex = {
  mc: 0, // multiple_choice, 2 câu, answer [1,0]
  fb: 0, // fill_blank, 2 chỗ trống, answer ["goes","school"]
  matching: 0, // matching, 3 cặp
  ec: 0, // error_correction, answer ["goes"]
  lf: 0, // listening_fill, 2 chỗ trống, answer ["apple","banana"]
  writing: 0, // PUBLISHED + in_library nhưng không chấm tự động
  speaking: 0, // như trên
  draft: 0, // DRAFT
  proposed: 0, // PROPOSED
  hidden: 0, // HIDDEN
  notInLibrary: 0, // PUBLISHED nhưng in_library = false
};
type ExerciseKey = keyof typeof ex;

const EXPLANATION = "Giải thích mẫu của bài.";

let server: Server;
let baseUrl = "";

// ---------------------------------------------------------------------------
// Tạo / dọn dữ liệu
// ---------------------------------------------------------------------------
const createUser = async (label: string, role: "ADMIN" | "TEACHER" | "STUDENT") => {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`,
      email: `${RUN_ID}_${label}@test.local`,
      passwordHash: "not-a-real-hash",
      role,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return user.id;
};

interface ExerciseSeed {
  label: string;
  type: string;
  skill: "READING" | "FOUNDATION" | "LISTENING" | "WRITING" | "SPEAKING";
  content: Record<string, unknown>;
  answer?: unknown; // undefined = lưu NULL (writing/speaking)
  status?: "DRAFT" | "PROPOSED" | "PUBLISHED" | "HIDDEN";
  inLibrary?: boolean;
}

const createExercise = async (seed: ExerciseSeed) => {
  const row = await prisma.exercise.create({
    data: {
      type: seed.type,
      skill: seed.skill,
      level: "A1",
      topic: `${RUN_ID} ${seed.label}`,
      content: seed.content as Prisma.InputJsonValue,
      answer:
        seed.answer === undefined ? undefined : (seed.answer as Prisma.InputJsonValue),
      explanation: EXPLANATION,
      status: seed.status ?? "PUBLISHED",
      source: "ADMIN",
      inLibrary: seed.inLibrary ?? true,
      createdById: users.admin,
    },
    select: { id: true },
  });
  return row.id;
};

// attempts có khóa ngoại RESTRICT tới users/exercises nên phải xóa attempts TRƯỚC
const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "Không kết nối được database. Kiểm tra DATABASE_URL trong server/.env và PostgreSQL đang chạy."
    );
  }

  // Dọn rác của lần chạy trước bị dừng giữa chừng (chỉ động vào user có tiền tố t4a_)
  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((u: { id: number }) => u.id));

  users.admin = await createUser("admin", "ADMIN");
  users.teacher = await createUser("teacher", "TEACHER");
  users.student = await createUser("student", "STUDENT");

  ex.mc = await createExercise({
    label: "mc",
    type: "multiple_choice",
    skill: "READING",
    content: {
      questions: [
        { q: "Q1", options: ["a", "b"] },
        { q: "Q2", options: ["c", "d"] },
      ],
    },
    answer: [1, 0],
  });
  ex.fb = await createExercise({
    label: "fb",
    type: "fill_blank",
    skill: "FOUNDATION",
    content: { text: "She ___ to ___." },
    answer: ["goes", "school"],
  });
  ex.matching = await createExercise({
    label: "matching",
    type: "matching",
    skill: "FOUNDATION",
    content: { left: ["cat", "dog", "bird"], right: ["mèo", "chó", "chim"] },
    answer: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  });
  ex.ec = await createExercise({
    label: "ec",
    type: "error_correction",
    skill: "FOUNDATION",
    content: { sentence: "She go to school.", wrong: "go" },
    answer: ["goes"],
  });
  ex.lf = await createExercise({
    label: "lf",
    type: "listening_fill",
    skill: "LISTENING",
    content: { script: "I like an apple and a banana.", blanks: 2 },
    answer: ["apple", "banana"],
  });
  ex.writing = await createExercise({
    label: "writing",
    type: "writing",
    skill: "WRITING",
    content: { prompt: "Describe your hometown.", minWords: 80 },
  });
  ex.speaking = await createExercise({
    label: "speaking",
    type: "speaking",
    skill: "SPEAKING",
    content: { prompt: "Talk about your day." },
  });

  const fbContent = { text: "She ___ to school." };
  ex.draft = await createExercise({
    label: "draft", type: "fill_blank", skill: "FOUNDATION",
    content: fbContent, answer: ["goes"], status: "DRAFT", inLibrary: false,
  });
  ex.proposed = await createExercise({
    label: "proposed", type: "fill_blank", skill: "FOUNDATION",
    content: fbContent, answer: ["goes"], status: "PROPOSED", inLibrary: false,
  });
  ex.hidden = await createExercise({
    label: "hidden", type: "fill_blank", skill: "FOUNDATION",
    content: fbContent, answer: ["goes"], status: "HIDDEN", inLibrary: false,
  });
  ex.notInLibrary = await createExercise({
    label: "not_in_library", type: "fill_blank", skill: "FOUNDATION",
    content: fbContent, answer: ["goes"], status: "PUBLISHED", inLibrary: false,
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanup(Object.values(users).filter((id) => id > 0));
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Hàm tiện ích
// ---------------------------------------------------------------------------
const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

interface ApiResult {
  status: number;
  rawText: string; // JSON thô, để kiểm tra chuỗi trả về thật sự
  body: {
    data: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
  };
}

const postAttempt = async (body: unknown, userId?: number, token?: string): Promise<ApiResult> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  else if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;

  const res = await fetch(`${baseUrl}/api/v1/attempts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) };
};

const submitAsStudent = (body: unknown) => postAttempt(body, users.student);

const countAttempts = () => prisma.attempt.count({ where: { studentId: users.student } });

// 8 field duy nhất được phép xuất hiện trong response nộp bài tự luyện
const RESULT_KEYS = [
  "answer",
  "attemptId",
  "correct",
  "errors",
  "explanation",
  "maxScore",
  "score",
  "total",
].sort();

// ---------------------------------------------------------------------------
// 201: mỗi dạng chấm tự động
// ---------------------------------------------------------------------------
interface GoodCase {
  name: string;
  key: ExerciseKey;
  submit: unknown; // bài làm của HS
  correctAnswer: unknown; // đáp án đúng của GV (phải được lộ ra)
  score: number;
  correct: number;
  total: number;
  errors: unknown[];
}

const GOOD_CASES: GoodCase[] = [
  {
    name: "multiple_choice (đúng 1/2)",
    key: "mc",
    submit: [1, 1],
    correctAnswer: [1, 0],
    score: 5,
    correct: 1,
    total: 2,
    errors: [{ type: "reading:wrong_choice", text: "d", correction: "c" }],
  },
  {
    name: "fill_blank (đúng 1/2, không phân biệt hoa/thường, trim)",
    key: "fb",
    submit: ["  Goes ", "home"],
    correctAnswer: ["goes", "school"],
    score: 5,
    correct: 1,
    total: 2,
    errors: [{ type: "foundation:wrong_blank", text: "home", correction: "school" }],
  },
  {
    name: "matching (đúng 1/3)",
    key: "matching",
    submit: [
      [0, 0],
      [1, 2],
    ],
    correctAnswer: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    score: 3.33,
    correct: 1,
    total: 3,
    errors: [
      { type: "foundation:wrong_match", text: "dog → chim", correction: "dog → chó" },
      { type: "foundation:wrong_match", text: "bird → ", correction: "bird → chim" },
    ],
  },
  {
    name: "error_correction (sai)",
    key: "ec",
    submit: ["went"],
    correctAnswer: ["goes"],
    score: 0,
    correct: 0,
    total: 1,
    errors: [{ type: "writing:wrong_correction", text: "went", correction: "goes" }],
  },
  {
    name: "listening_fill (đúng 1/2)",
    key: "lf",
    submit: ["APPLE", "x"],
    correctAnswer: ["apple", "banana"],
    score: 5,
    correct: 1,
    total: 2,
    errors: [{ type: "listening:wrong_blank", text: "x", correction: "banana" }],
  },
];

describe("POST /api/v1/attempts - STUDENT nộp bài tự luyện (201)", () => {
  for (const c of GOOD_CASES) {
    it(`${c.name}: 201, điểm đúng, lưu đúng dòng attempts`, async () => {
      const exerciseId = ex[c.key];
      const res = await submitAsStudent({ exerciseId, answer: c.submit });

      expect(res.status).toBe(201);
      expect(res.body.error).toBeNull();

      const data = res.body.data!;
      expect(Object.keys(data).sort()).toEqual(RESULT_KEYS);
      expect(data.score).toBe(c.score);
      expect(data.maxScore).toBe(10);
      expect(data.correct).toBe(c.correct);
      expect(data.total).toBe(c.total);
      expect(data.errors).toEqual(c.errors);
      // Tự luyện: lộ đáp án + giải thích ngay (4c.4)
      expect(data.answer).toEqual(c.correctAnswer);
      expect(data.explanation).toBe(EXPLANATION);

      // Dòng attempts trong DB
      const row = await prisma.attempt.findUnique({ where: { id: data.attemptId as number } });
      expect(row).not.toBeNull();
      expect(row!.studentId).toBe(users.student);
      expect(row!.exerciseId).toBe(exerciseId);
      expect(row!.assignmentId).toBeNull();
      expect(row!.mode).toBe("practice");
      expect(row!.answer).toEqual(c.submit);
      expect(row!.score).toBe(c.score);
      expect(row!.maxScore).toBe(10);
      expect(row!.errors).toEqual(c.errors);
      expect(row!.isLate).toBe(false);
      expect(row!.submittedAt).toBeInstanceOf(Date);
    });
  }

  it("làm đúng hết: điểm 10, errors rỗng", async () => {
    const res = await submitAsStudent({ exerciseId: ex.fb, answer: ["GOES", " School "] });
    expect(res.status).toBe(201);
    expect(res.body.data!.score).toBe(10);
    expect(res.body.data!.correct).toBe(2);
    expect(res.body.data!.errors).toEqual([]);
  });

  it("mode: \"practice\" gửi tường minh vẫn được", async () => {
    const res = await submitAsStudent({
      exerciseId: ex.ec,
      answer: ["goes"],
      mode: "practice",
    });
    expect(res.status).toBe(201);
    expect(res.body.data!.score).toBe(10);
  });

  it("nộp lần 2 cùng bài: lại 201 và là dòng mới (không giới hạn)", async () => {
    const before = await prisma.attempt.count({
      where: { studentId: users.student, exerciseId: ex.fb },
    });

    const first = await submitAsStudent({ exerciseId: ex.fb, answer: ["goes", "school"] });
    const second = await submitAsStudent({ exerciseId: ex.fb, answer: ["goes", "home"] });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data!.attemptId).not.toBe(first.body.data!.attemptId);
    expect(first.body.data!.score).toBe(10);
    expect(second.body.data!.score).toBe(5);

    const after = await prisma.attempt.count({
      where: { studentId: users.student, exerciseId: ex.fb },
    });
    expect(after).toBe(before + 2);
  });
});

// ---------------------------------------------------------------------------
// 401 / 403
// ---------------------------------------------------------------------------
describe("POST /api/v1/attempts - xác thực và phân quyền", () => {
  const validBody = () => ({ exerciseId: ex.fb, answer: ["goes", "school"] });

  it("không token -> 401", async () => {
    const res = await postAttempt(validBody());
    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
    expect(res.body.error!.code).toBe("UNAUTHORIZED");
  });

  it("token sai -> 401", async () => {
    const res = await postAttempt(validBody(), undefined, "token-khong-hop-le");
    expect(res.status).toBe(401);
    expect(res.body.error!.code).toBe("INVALID_TOKEN");
  });

  it("TEACHER -> 403 và không tạo attempt", async () => {
    const res = await postAttempt(validBody(), users.teacher);
    expect(res.status).toBe(403);
    expect(res.body.error!.code).toBe("FORBIDDEN");
    expect(await prisma.attempt.count({ where: { studentId: users.teacher } })).toBe(0);
  });

  it("ADMIN -> 403 và không tạo attempt", async () => {
    const res = await postAttempt(validBody(), users.admin);
    expect(res.status).toBe(403);
    expect(res.body.error!.code).toBe("FORBIDDEN");
    expect(await prisma.attempt.count({ where: { studentId: users.admin } })).toBe(0);
  });

  it("TEACHER gửi body sai vẫn nhận 403 (kiểm quyền trước kiểm body)", async () => {
    const res = await postAttempt({}, users.teacher);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 404: không lộ bài chưa công bố
// ---------------------------------------------------------------------------
describe("POST /api/v1/attempts - bài không nộp được (404)", () => {
  const cases: [string, () => number][] = [
    ["bài không tồn tại", () => 2147483647],
    ["bài DRAFT", () => ex.draft],
    ["bài PROPOSED", () => ex.proposed],
    ["bài HIDDEN", () => ex.hidden],
    ["bài PUBLISHED nhưng không in_library", () => ex.notInLibrary],
  ];

  for (const [name, getId] of cases) {
    it(`${name} -> 404 NOT_FOUND, không tạo attempt`, async () => {
      const before = await countAttempts();
      const res = await submitAsStudent({ exerciseId: getId(), answer: ["goes"] });

      expect(res.status).toBe(404);
      expect(res.body.data).toBeNull();
      expect(res.body.error!.code).toBe("NOT_FOUND");
      expect(await countAttempts()).toBe(before);
    });
  }

  it("404 của bài DRAFT giống hệt bài không tồn tại (không dò được)", async () => {
    const missing = await submitAsStudent({ exerciseId: 2147483647, answer: ["goes"] });
    const draft = await submitAsStudent({ exerciseId: ex.draft, answer: ["goes"] });
    expect(draft.body.error).toEqual(missing.body.error);
  });
});

// ---------------------------------------------------------------------------
// 400 / 422
// ---------------------------------------------------------------------------
describe("POST /api/v1/attempts - dữ liệu sai (400 / 422)", () => {
  const badBodies: [string, () => unknown][] = [
    // Lỗi từ Zod (body)
    ["thiếu exerciseId", () => ({ answer: ["goes", "school"] })],
    ["exerciseId là chuỗi", () => ({ exerciseId: String(ex.fb), answer: ["goes", "school"] })],
    ["exerciseId = 0", () => ({ exerciseId: 0, answer: ["goes", "school"] })],
    ["exerciseId âm", () => ({ exerciseId: -1, answer: ["goes", "school"] })],
    ["exerciseId thập phân", () => ({ exerciseId: 1.5, answer: ["goes", "school"] })],
    ["thiếu answer", () => ({ exerciseId: ex.fb })],
    ["assignmentId là chuỗi", () => ({ exerciseId: ex.fb, answer: ["goes", "school"], assignmentId: "1" })],
    ["assignmentId = 0", () => ({ exerciseId: ex.fb, answer: ["goes", "school"], assignmentId: 0 })],
    ["assignmentId âm", () => ({ exerciseId: ex.fb, answer: ["goes", "school"], assignmentId: -1 })],
    ["assignmentId thập phân", () => ({ exerciseId: ex.fb, answer: ["goes", "school"], assignmentId: 1.5 })],
    ["assignmentId vượt INT (2147483648)", () => ({ exerciseId: ex.fb, answer: ["goes", "school"], assignmentId: 2147483648 })],
    ["assignmentId (null)", () => ({ exerciseId: ex.fb, answer: ["goes", "school"], assignmentId: null })],
    ["exerciseId (null)", () => ({ exerciseId: null, answer: ["goes", "school"] })],
    ["mode = exam", () => ({ exerciseId: ex.fb, answer: ["goes", "school"], mode: "exam" })],
    ["mode = Practice (sai hoa/thường)", () => ({ exerciseId: ex.fb, answer: ["goes", "school"], mode: "Practice" })],
    ["mode = null", () => ({ exerciseId: ex.fb, answer: ["goes", "school"], mode: null })],
    // Lỗi từ registry chấm (hình dạng/độ dài answer)
    ["answer = null", () => ({ exerciseId: ex.fb, answer: null })],
    ["fill_blank: answer không phải mảng", () => ({ exerciseId: ex.fb, answer: "goes" })],
    ["fill_blank: thiếu phần tử", () => ({ exerciseId: ex.fb, answer: ["goes"] })],
    ["fill_blank: thừa phần tử", () => ({ exerciseId: ex.fb, answer: ["goes", "school", "x"] })],
    ["fill_blank: phần tử là số", () => ({ exerciseId: ex.fb, answer: ["goes", 5] })],
    ["fill_blank: chuỗi 501 ký tự", () => ({ exerciseId: ex.fb, answer: ["a".repeat(501), "school"] })],
    ["multiple_choice: sai độ dài", () => ({ exerciseId: ex.mc, answer: [1] })],
    ["multiple_choice: phần tử là chuỗi", () => ({ exerciseId: ex.mc, answer: ["1", "0"] })],
    ["multiple_choice: số âm", () => ({ exerciseId: ex.mc, answer: [-1, 0] })],
    ["matching: trùng cột trái", () => ({ exerciseId: ex.matching, answer: [[0, 0], [0, 1]] })],
    ["matching: ngoài phạm vi", () => ({ exerciseId: ex.matching, answer: [[0, 9]] })],
    ["matching: nhiều hơn số cặp", () => ({ exerciseId: ex.matching, answer: [[0, 0], [1, 1], [2, 2], [0, 1]] })],
    ["error_correction: thừa phần tử", () => ({ exerciseId: ex.ec, answer: ["goes", "x"] })],
    ["listening_fill: sai độ dài", () => ({ exerciseId: ex.lf, answer: ["apple"] })],
  ];

  for (const [name, getBody] of badBodies) {
    it(`${name} -> 400 VALIDATION_ERROR, không tạo attempt`, async () => {
      const before = await countAttempts();
      const res = await submitAsStudent(getBody());

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
      expect(res.body.error!.code).toBe("VALIDATION_ERROR");
      expect(res.body.error!.message.length).toBeGreaterThan(0);
      expect(await countAttempts()).toBe(before);
    });
  }

  for (const key of ["writing", "speaking"] as const) {
    it(`${key} -> 422 NOT_AUTO_GRADABLE, không tạo attempt`, async () => {
      const before = await countAttempts();
      const res = await submitAsStudent({ exerciseId: ex[key], answer: { text: "Hello" } });

      expect(res.status).toBe(422);
      expect(res.body.data).toBeNull();
      expect(res.body.error!.code).toBe("NOT_AUTO_GRADABLE");
      expect(await countAttempts()).toBe(before);
    });
  }
});

// ---------------------------------------------------------------------------
// assignmentId không tồn tại -> 404 (nhánh bài giao đã được hỗ trợ)
// ---------------------------------------------------------------------------
describe("POST /api/v1/attempts - assignmentId không tồn tại (404)", () => {
  const MISSING_ASSIGNMENT_ID = 2147483647;

  it("-> 404 NOT_FOUND, message 'Không tìm thấy bài giao', không tạo attempt", async () => {
    const before = await countAttempts();
    const res = await submitAsStudent({
      exerciseId: ex.fb,
      answer: ["goes", "school"],
      assignmentId: MISSING_ASSIGNMENT_ID,
    });

    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
    expect(res.body.error!.code).toBe("NOT_FOUND");
    expect(res.body.error!.message).toContain("Không tìm thấy bài giao");
    expect(await countAttempts()).toBe(before);
  });

  it("không gửi exerciseId vẫn qua schema, tới service rồi mới 404", async () => {
    const before = await countAttempts();
    const res = await submitAsStudent({
      answer: ["goes", "school"],
      assignmentId: MISSING_ASSIGNMENT_ID,
    });

    expect(res.status).toBe(404);
    expect(res.body.error!.code).toBe("NOT_FOUND");
    expect(await countAttempts()).toBe(before);
  });

  it("gửi assignmentId thì exerciseId (bài tự luyện hợp lệ) không cứu được: vẫn 404", async () => {
    const res = await submitAsStudent({
      exerciseId: ex.mc,
      answer: [1, 0],
      assignmentId: MISSING_ASSIGNMENT_ID,
    });
    expect(res.status).toBe(404);
    expect(res.body.error!.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// Field client gửi thừa bị bỏ qua
// ---------------------------------------------------------------------------
describe("POST /api/v1/attempts - không tin dữ liệu client gửi thừa", () => {
  it("studentId/score/maxScore/errors/isLate/submittedAt trong body bị bỏ qua", async () => {
    const res = await submitAsStudent({
      exerciseId: ex.fb,
      answer: ["goes", "home"], // thực tế đúng 1/2 -> 5 điểm
      studentId: users.teacher,
      score: 10,
      maxScore: 99,
      errors: [],
      isLate: true,
      submittedAt: "2000-01-01T00:00:00.000Z",
      teacherScore: 10,
      id: 1,
    });

    expect(res.status).toBe(201);
    expect(res.body.data!.score).toBe(5);
    expect(res.body.data!.maxScore).toBe(10);
    expect(res.body.data!.errors).toEqual([
      { type: "foundation:wrong_blank", text: "home", correction: "school" },
    ]);

    const row = await prisma.attempt.findUnique({
      where: { id: res.body.data!.attemptId as number },
    });
    expect(row!.studentId).toBe(users.student); // lấy từ JWT, không phải teacher
    expect(row!.score).toBe(5);
    expect(row!.maxScore).toBe(10);
    expect(row!.isLate).toBe(false);
    expect(row!.teacherScore).toBeNull();
    expect(row!.submittedAt.getFullYear()).toBeGreaterThan(2000);
    expect(await prisma.attempt.count({ where: { studentId: users.teacher } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Response không có field thừa / bí mật
// ---------------------------------------------------------------------------
describe("POST /api/v1/attempts - response sạch", () => {
  it("chỉ có đúng các field cho phép, không có thông tin user/bài", async () => {
    const res = await submitAsStudent({ exerciseId: ex.fb, answer: ["goes", "school"] });
    expect(res.status).toBe(201);

    expect(Object.keys(res.body.data!).sort()).toEqual(RESULT_KEYS);

    const forbidden = [
      "passwordHash",
      "password",
      "not-a-real-hash",
      "@test.local",
      "email",
      "studentId",
      "exerciseId",
      "assignmentId",
      "createdById",
      "inLibrary",
      "status",
      "aiFeedback",
      "teacherScore",
      "teacherComment",
      "isLate",
      "submittedAt",
      "JWT_SECRET",
    ];
    for (const word of forbidden) {
      expect(res.rawText).not.toContain(word);
    }
  });
});