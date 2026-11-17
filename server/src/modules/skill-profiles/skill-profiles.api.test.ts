/**
 * Test tích hợp API hồ sơ kỹ năng (T15): PostgreSQL thật + gọi HTTP vào `app` thật.
 *
 * - Dùng DATABASE_URL trong .env. Không gọi AI.
 * - Dữ liệu tạo bằng Prisma, riêng cho lần chạy này (tiền tố "t15sp_"), xóa sạch sau khi chạy.
 * - skill_profiles được tạo bằng chính hàm T14 `recomputeSkillProfile` (chỉ GỌI, không sửa), nên test
 *   kiểm cả đường "T14 ghi → T15 đọc".
 *
 * LƯU Ý ĐÃ CHỐT: `authenticate` (không sửa ở T15) trả 401 cho tài khoản không ACTIVE (GV PENDING, HS LOCKED),
 * nên các test đó kỳ vọng 401 chứ không phải 403.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import type { Skill } from "@prisma/client";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { recomputeSkillProfile } from "./skill-profiles.recompute";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PREFIX = "t15sp_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const ids = {
  admin: 0,
  teacherA: 0,
  teacherB: 0,
  teacherPending: 0,
  s1: 0, // HS chính, trong lớp A của teacherA
  s2: 0, // HS test sát biên, trong lớp A
  noClass: 0, // HS không thuộc lớp nào
  s4: 0, // HS trong lớp B của teacherB
  locked: 0, // HS bị khóa
  classA: 0,
  classB: 0,
};
const allUserIds: number[] = [];

let server: Server;
let baseUrl = "";

const BASE_TIME = new Date("2026-01-01T00:00:00.000Z").getTime();
/** Mốc thời gian cố định: minute càng lớn càng mới. */
const at = (minute: number) => new Date(BASE_TIME + minute * 60_000);

const SKILLS_IN_ORDER: Skill[] = ["LISTENING", "SPEAKING", "READING", "WRITING", "FOUNDATION"];

// ---------------------------------------------------------------------------
// Tạo / dọn dữ liệu
// ---------------------------------------------------------------------------
const createUser = async (
  label: string,
  role: "ADMIN" | "TEACHER" | "STUDENT",
  status: "ACTIVE" | "PENDING" | "LOCKED" = "ACTIVE"
) => {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`,
      email: `${RUN_ID}_${label}@test.local`,
      passwordHash: "not-a-real-hash",
      role,
      status,
    },
    select: { id: true },
  });
  allUserIds.push(user.id);
  return user.id;
};

const makeClassCode = () => {
  let code = "";
  while (code.length < 6) code += Math.random().toString(36).slice(2).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.slice(0, 6);
};

const createClass = async (label: string, teacherId: number, memberIds: number[]) => {
  const row = await prisma.class.create({
    data: { name: `${RUN_ID} ${label}`, code: makeClassCode(), teacherId },
    select: { id: true },
  });
  for (const studentId of memberIds) {
    await prisma.classMember.create({ data: { classId: row.id, studentId } });
  }
  return row.id;
};

const createExercise = async (skill: Skill) => {
  const row = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill,
      level: "A1",
      topic: `${RUN_ID} topic`,
      content: { text: "She ___ to school." },
      answer: ["goes"],
      status: "PUBLISHED",
      source: "ADMIN",
      inLibrary: true,
      createdById: ids.teacherA,
    },
    select: { id: true },
  });
  return row.id;
};

const createAttempt = async (opts: {
  studentId: number;
  exerciseId: number;
  assignmentId?: number | null;
  score: number | null;
  teacherScore?: number | null;
  errors?: unknown[];
  minute: number;
}) =>
  prisma.attempt.create({
    data: {
      studentId: opts.studentId,
      exerciseId: opts.exerciseId,
      assignmentId: opts.assignmentId ?? null,
      answer: ["goes"],
      score: opts.score,
      teacherScore: opts.teacherScore ?? null,
      errors: opts.errors === undefined ? Prisma.DbNull : (opts.errors as Prisma.InputJsonValue),
      submittedAt: at(opts.minute),
    },
    select: { id: true },
  });

/** Một attempt tự luyện trên một bài MỚI (mỗi lần gọi = một điểm đại diện riêng). */
const addPractice = async (
  studentId: number,
  skill: Skill,
  score: number,
  minute: number,
  errors?: unknown[],
  teacherScore?: number
) => {
  const exerciseId = await createExercise(skill);
  await createAttempt({ studentId, exerciseId, score, minute, errors, teacherScore });
};

/** Gọi hàm T14 để ghi dòng skill_profiles từ attempts đã tạo. */
const refresh = (studentId: number, skill: Skill) => recomputeSkillProfile(prisma, studentId, skill);

/** Tạo các attempt tự luyện cùng điểm rồi cập nhật hồ sơ (phục vụ test ngưỡng). */
const seedSameScores = async (studentId: number, skill: Skill, score: number, count = 3) => {
  for (let i = 1; i <= count; i += 1) await addPractice(studentId, skill, score, i);
  await refresh(studentId, skill);
};

// attempt có khóa ngoại RESTRICT nên xóa theo thứ tự: attempt -> bài giao -> lớp -> bài -> user
// (skill_profiles và class_members tự xóa theo user/lớp).
const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.assignment.deleteMany({ where: { assignedById: { in: userIds } } });
  await prisma.class.deleteMany({ where: { teacherId: { in: userIds } } });
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

  // Dọn dữ liệu còn sót của lần chạy trước bị ngắt giữa chừng.
  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((u: { id: number }) => u.id));

  ids.admin = await createUser("admin", "ADMIN");
  ids.teacherA = await createUser("teacher_a", "TEACHER");
  ids.teacherB = await createUser("teacher_b", "TEACHER");
  ids.teacherPending = await createUser("teacher_pending", "TEACHER", "PENDING");
  ids.s1 = await createUser("s1", "STUDENT");
  ids.s2 = await createUser("s2", "STUDENT");
  ids.noClass = await createUser("no_class", "STUDENT");
  ids.s4 = await createUser("s4", "STUDENT");
  ids.locked = await createUser("locked", "STUDENT", "LOCKED");

  ids.classA = await createClass("class_a", ids.teacherA, [ids.s1, ids.s2]);
  ids.classB = await createClass("class_b", ids.teacherB, [ids.s4]);

  // ---- S1: LISTENING/SPEAKING không có dữ liệu ----

  // ---- S1 READING: 2 điểm (5, 7) -> có score nhưng level null; có lỗi để kiểm error_stats ----
  await addPractice(ids.s1, "READING", 5, 1, [{ type: "grammar:tense" }, { type: "vocab" }]);
  await addPractice(ids.s1, "READING", 7, 2, [{ type: "grammar:tense" }]);
  await refresh(ids.s1, "READING");

  // ---- S1 WRITING: 25 bài tự luyện khác nhau, điểm = i % 10 (kiểm tối đa 20 điểm, thứ tự cũ -> mới) ----
  for (let i = 1; i <= 25; i += 1) await addPractice(ids.s1, "WRITING", i % 10, i);
  await refresh(ids.s1, "WRITING");

  // ---- S1 FOUNDATION: bài giao nộp 3 lần (3, 9, 6) -> chỉ 1 điểm là 9; thêm bài có điểm GV ghi đè ----
  const foundationExercise = await createExercise("FOUNDATION");
  const assignment = await prisma.assignment.create({
    data: {
      exerciseId: foundationExercise,
      classId: ids.classA,
      assignedById: ids.teacherA,
      dueAt: at(10_000),
    },
    select: { id: true },
  });
  await createAttempt({ studentId: ids.s1, exerciseId: foundationExercise, assignmentId: assignment.id, score: 3, minute: 1 });
  await createAttempt({ studentId: ids.s1, exerciseId: foundationExercise, assignmentId: assignment.id, score: 9, minute: 2 });
  await createAttempt({ studentId: ids.s1, exerciseId: foundationExercise, assignmentId: assignment.id, score: 6, minute: 3 });
  await addPractice(ids.s1, "FOUNDATION", 2, 4, undefined, 7.5); // AI chấm 2, GV ghi đè 7.5
  await refresh(ids.s1, "FOUNDATION");

  // ---- S2: sát biên các ngưỡng 4 / 6 (mỗi kỹ năng 3 điểm bằng nhau) ----
  await seedSameScores(ids.s2, "LISTENING", 3.99); // A1
  await seedSameScores(ids.s2, "SPEAKING", 4); // A2
  await seedSameScores(ids.s2, "READING", 5.99); // A2
  await seedSameScores(ids.s2, "WRITING", 6); // B1
  await seedSameScores(ids.s2, "FOUNDATION", 7.99); // B1

  // ---- noClass: sát biên ngưỡng 8 ----
  await seedSameScores(ids.noClass, "LISTENING", 8); // B2

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanup(allUserIds);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Hàm tiện ích gọi HTTP
// ---------------------------------------------------------------------------
interface ProfileItem {
  skill: string;
  score: number | null;
  level: string | null;
  error_stats: Record<string, number>;
  progress: { date: string; score: number }[];
  updated_at: string | null;
}
interface ProfileData {
  student: { id: number; name: string };
  skills: ProfileItem[];
}
interface ApiResult {
  status: number;
  rawText: string;
  body: {
    data: ProfileData | null;
    error: { code: string; message: string } | null;
  };
}

const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

const get = async (path: string, userId?: number): Promise<ApiResult> => {
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers.Authorization = `Bearer ${tokenOf(userId)}`;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const rawText = await res.text();
  return { status: res.status, rawText, body: JSON.parse(rawText) };
};

const dataOf = (result: ApiResult): ProfileData => {
  if (result.body.data === null) throw new Error(`Không có data (status ${result.status}): ${result.rawText}`);
  return result.body.data;
};

const skillOf = (data: ProfileData, skill: Skill): ProfileItem => {
  const item = data.skills.find((s) => s.skill === skill);
  if (!item) throw new Error(`Thiếu kỹ năng ${skill}`);
  return item;
};

const expectNoSecrets = (rawText: string) => {
  for (const word of [
    "passwordHash",
    "password_hash",
    "email",
    "@test.local",
    "not-a-real-hash",
    "JWT_SECRET",
    "GEMINI_API_KEY",
    "answer",
  ]) {
    expect(rawText).not.toContain(word);
  }
  const secrets = [env.JWT_SECRET, process.env.GEMINI_API_KEY];
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 8) expect(rawText).not.toContain(secret);
  }
};

const expectNotFound = (result: ApiResult) => {
  expect(result.status).toBe(404);
  expect(result.body.data).toBeNull();
  expect(result.body.error?.code).toBe("STUDENT_NOT_FOUND");
};

// ---------------------------------------------------------------------------
// 401 / 403 / 400
// ---------------------------------------------------------------------------
describe("T15 xác thực và vai trò", () => {
  it("không token -> 401 (cả hai endpoint)", async () => {
    expect((await get("/api/v1/skill-profiles/me")).status).toBe(401);
    expect((await get(`/api/v1/skill-profiles/students/${ids.s1}`)).status).toBe(401);
  });

  it("GV và ADMIN gọi /me -> 403", async () => {
    expect((await get("/api/v1/skill-profiles/me", ids.teacherA)).status).toBe(403);
    expect((await get("/api/v1/skill-profiles/me", ids.admin)).status).toBe(403);
  });

  it("HS gọi /students/:id -> 403 (kể cả id của chính mình)", async () => {
    expect((await get(`/api/v1/skill-profiles/students/${ids.s2}`, ids.s1)).status).toBe(403);
    expect((await get(`/api/v1/skill-profiles/students/${ids.s1}`, ids.s1)).status).toBe(403);
  });

  it("GV chưa duyệt (PENDING) và HS bị khóa (LOCKED) bị chặn 401 bởi authenticate", async () => {
    expect((await get(`/api/v1/skill-profiles/students/${ids.s1}`, ids.teacherPending)).status).toBe(401);
    expect((await get("/api/v1/skill-profiles/me", ids.locked)).status).toBe(401);
  });

  it.each(["abc", "0", "-1", "1.5", "1e3", "%207", "99999999999"])(
    ":studentId sai định dạng (%s) -> 400",
    async (bad) => {
      for (const userId of [ids.teacherA, ids.admin]) {
        const result = await get(`/api/v1/skill-profiles/students/${bad}`, userId);
        expect(result.status).toBe(400);
        expect(result.body.data).toBeNull();
        expect(result.body.error?.code).toBe("VALIDATION_ERROR");
      }
    }
  );
});

// ---------------------------------------------------------------------------
// HS xem hồ sơ của mình
// ---------------------------------------------------------------------------
describe("T15 GET /me", () => {
  it("trả đủ 5 kỹ năng đúng thứ tự, đúng dạng dữ liệu, không lộ trường thừa", async () => {
    const result = await get("/api/v1/skill-profiles/me", ids.s1);
    expect(result.status).toBe(200);
    expect(result.body.error).toBeNull();

    const data = dataOf(result);
    expect(Object.keys(data).sort()).toEqual(["skills", "student"]);
    expect(Object.keys(data.student).sort()).toEqual(["id", "name"]);
    expect(data.student.id).toBe(ids.s1);
    expect(data.skills.map((s) => s.skill)).toEqual(SKILLS_IN_ORDER);
    for (const item of data.skills) {
      expect(Object.keys(item).sort()).toEqual(
        ["error_stats", "level", "progress", "score", "skill", "updated_at"]
      );
    }
    expectNoSecrets(result.rawText);
  });

  it("kỹ năng chưa có dữ liệu -> score null, level null, error_stats {}, progress [], updated_at null", async () => {
    const data = dataOf(await get("/api/v1/skill-profiles/me", ids.s1));
    for (const skill of ["LISTENING", "SPEAKING"] as Skill[]) {
      expect(skillOf(data, skill)).toEqual({
        skill,
        score: null,
        level: null,
        error_stats: {},
        progress: [],
        updated_at: null,
      });
    }
  });

  it("chỉ 2 điểm -> có score nhưng level null; error_stats đọc từ skill_profiles", async () => {
    const reading = skillOf(dataOf(await get("/api/v1/skill-profiles/me", ids.s1)), "READING");
    expect(reading.score).toBe(6);
    expect(reading.level).toBeNull();
    expect(reading.error_stats).toEqual({ "grammar:tense": 2, vocab: 1 });
    expect(reading.progress).toEqual([
      { date: at(1).toISOString(), score: 5 },
      { date: at(2).toISOString(), score: 7 },
    ]);
    expect(typeof reading.updated_at).toBe("string");
  });

  it("đủ 3 điểm -> có level", async () => {
    const writing = skillOf(dataOf(await get("/api/v1/skill-profiles/me", ids.s1)), "WRITING");
    expect(typeof writing.score).toBe("number");
    expect(writing.level).not.toBeNull();
  });

  it("progress: tối đa 20 điểm, đúng thứ tự cũ -> mới", async () => {
    const writing = skillOf(dataOf(await get("/api/v1/skill-profiles/me", ids.s1)), "WRITING");
    expect(writing.progress).toHaveLength(20);
    // 25 bài, điểm = i % 10, lấy 20 bài gần nhất (i = 6..25) xếp cũ -> mới
    expect(writing.progress.map((p) => p.score)).toEqual(Array.from({ length: 20 }, (_, k) => (k + 6) % 10));
    expect(writing.progress.map((p) => p.date)).toEqual(
      Array.from({ length: 20 }, (_, k) => at(k + 6).toISOString())
    );
  });

  it("progress: bài giao nộp nhiều lần chỉ 1 điểm (cao nhất); điểm GV ghi đè thay cho điểm AI", async () => {
    const foundation = skillOf(dataOf(await get("/api/v1/skill-profiles/me", ids.s1)), "FOUNDATION");
    // bài giao nộp 3, 9, 6 -> chỉ điểm 9 (mốc = lần nộp 9); bài tự luyện AI chấm 2, GV ghi đè 7.5 -> 7.5
    expect(foundation.progress).toEqual([
      { date: at(2).toISOString(), score: 9 },
      { date: at(4).toISOString(), score: 7.5 },
    ]);
    expect(foundation.score).toBe(8.25);
    expect(foundation.level).toBeNull(); // mới 2 điểm
  });

  it("HS A không xem được HS B: /me luôn là của chính mình, tham số thừa bị bỏ qua", async () => {
    const own = dataOf(await get("/api/v1/skill-profiles/me", ids.s1));
    expect(own.student.id).toBe(ids.s1);

    const other = dataOf(await get("/api/v1/skill-profiles/me", ids.s2));
    expect(other.student.id).toBe(ids.s2);

    const tryOther = dataOf(await get(`/api/v1/skill-profiles/me?studentId=${ids.s2}`, ids.s1));
    expect(tryOther.student.id).toBe(ids.s1);
  });
});

// ---------------------------------------------------------------------------
// GV / ADMIN xem HS
// ---------------------------------------------------------------------------
describe("T15 GET /students/:studentId", () => {
  it("GV chủ lớp -> 200, cùng dữ liệu với /me của HS đó, không lộ trường thừa", async () => {
    const viaTeacher = await get(`/api/v1/skill-profiles/students/${ids.s1}`, ids.teacherA);
    expect(viaTeacher.status).toBe(200);
    expectNoSecrets(viaTeacher.rawText);

    const viaSelf = await get("/api/v1/skill-profiles/me", ids.s1);
    expect(viaTeacher.body.data).toEqual(viaSelf.body.data);
  });

  it("GV lớp khác -> 404; GV chủ lớp xem HS lớp mình khác -> 200", async () => {
    expectNotFound(await get(`/api/v1/skill-profiles/students/${ids.s1}`, ids.teacherB));
    expectNotFound(await get(`/api/v1/skill-profiles/students/${ids.s4}`, ids.teacherA));
    expect((await get(`/api/v1/skill-profiles/students/${ids.s4}`, ids.teacherB)).status).toBe(200);
    expect((await get(`/api/v1/skill-profiles/students/${ids.s2}`, ids.teacherA)).status).toBe(200);
  });

  it("HS không có trong lớp nào của GV -> 404", async () => {
    expectNotFound(await get(`/api/v1/skill-profiles/students/${ids.noClass}`, ids.teacherA));
  });

  it("id không tồn tại / là GV / là ADMIN -> 404, cùng một kiểu trả lời (không lộ sự tồn tại)", async () => {
    const missingId = 2_000_000_000;
    const results = [
      await get(`/api/v1/skill-profiles/students/${missingId}`, ids.teacherA),
      await get(`/api/v1/skill-profiles/students/${ids.teacherB}`, ids.teacherA),
      await get(`/api/v1/skill-profiles/students/${ids.admin}`, ids.teacherA),
      await get(`/api/v1/skill-profiles/students/${ids.s4}`, ids.teacherA), // HS có thật nhưng lớp khác
      await get(`/api/v1/skill-profiles/students/${missingId}`, ids.admin),
      await get(`/api/v1/skill-profiles/students/${ids.teacherA}`, ids.admin),
      await get(`/api/v1/skill-profiles/students/${ids.admin}`, ids.admin),
    ];
    for (const result of results) expectNotFound(result);
    // Cùng nội dung lỗi: người gọi không phân biệt được "không tồn tại" với "không có quyền".
    const first = results[0].rawText;
    for (const result of results) expect(result.rawText).toBe(first);
  });

  it("ADMIN xem mọi HS (kể cả HS không có lớp) -> 200", async () => {
    expect((await get(`/api/v1/skill-profiles/students/${ids.s1}`, ids.admin)).status).toBe(200);
    expect((await get(`/api/v1/skill-profiles/students/${ids.s4}`, ids.admin)).status).toBe(200);
    const noClass = await get(`/api/v1/skill-profiles/students/${ids.noClass}`, ids.admin);
    expect(noClass.status).toBe(200);
    expectNoSecrets(noClass.rawText);
  });
});

// ---------------------------------------------------------------------------
// Ngưỡng level sát biên (4 / 6 / 8)
// ---------------------------------------------------------------------------
describe("T15 level đúng ngưỡng", () => {
  it("3.99 -> A1, 4.00 -> A2, 5.99 -> A2, 6.00 -> B1, 7.99 -> B1", async () => {
    const data = dataOf(await get(`/api/v1/skill-profiles/students/${ids.s2}`, ids.admin));
    expect(skillOf(data, "LISTENING").level).toBe("A1");
    expect(skillOf(data, "SPEAKING").level).toBe("A2");
    expect(skillOf(data, "READING").level).toBe("A2");
    expect(skillOf(data, "WRITING").level).toBe("B1");
    expect(skillOf(data, "FOUNDATION").level).toBe("B1");
    expect(skillOf(data, "LISTENING").score).toBeCloseTo(3.99, 2);
  });

  it("8.00 -> B2", async () => {
    const data = dataOf(await get(`/api/v1/skill-profiles/students/${ids.noClass}`, ids.admin));
    expect(skillOf(data, "LISTENING").level).toBe("B2");
    expect(skillOf(data, "LISTENING").score).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// error_stats đọc từ skill_profiles (không tính lại) và được lọc an toàn
// ---------------------------------------------------------------------------
describe("T15 error_stats", () => {
  it("đọc nguyên từ skill_profiles, bỏ giá trị hỏng", async () => {
    await prisma.skillProfile.update({
      where: { studentId_skill: { studentId: ids.noClass, skill: "LISTENING" } },
      data: { errorStats: { "custom:x": 9, bad: "text", negative: -1 } },
    });
    const data = dataOf(await get(`/api/v1/skill-profiles/students/${ids.noClass}`, ids.admin));
    expect(skillOf(data, "LISTENING").error_stats).toEqual({ "custom:x": 9 });
  });
});