/**
 * Test tích hợp recomputeSkillProfile (T14): DB PostgreSQL thật.
 *
 * - Dùng DATABASE_URL trong .env. Không gọi AI.
 * - Tự tạo user/bài/lớp/bài giao/attempt riêng, xóa sạch sau khi chạy.
 * - Tiền tố "t14sp_" riêng để không xóa nhầm dữ liệu test khác.
 * - Mỗi test dùng học sinh MỚI để kỳ vọng không bị lẫn dữ liệu của test khác.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Skill } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { recomputeSkillProfile } from "./skill-profiles.recompute";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const PREFIX = "t14sp_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const ids = { teacher: 0, classId: 0 };
const studentIds: number[] = [];
let studentCounter = 0;

const BASE_TIME = new Date("2026-01-01T00:00:00.000Z").getTime();
/** Mốc thời gian cố định: minute càng lớn càng mới. */
const at = (minute: number) => new Date(BASE_TIME + minute * 60_000);

const createUser = async (label: string, role: "TEACHER" | "STUDENT") => {
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

const newStudent = async () => {
  studentCounter += 1;
  const id = await createUser(`student_${studentCounter}`, "STUDENT");
  studentIds.push(id);
  return id;
};

const newExercise = async (skill: Skill) => {
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
      createdById: ids.teacher,
    },
    select: { id: true },
  });
  return row.id;
};

const newAssignment = async (exerciseId: number) => {
  const row = await prisma.assignment.create({
    data: {
      exerciseId,
      classId: ids.classId,
      assignedById: ids.teacher,
      dueAt: at(10_000),
    },
    select: { id: true },
  });
  return row.id;
};

const newAttempt = async (opts: {
  studentId: number;
  exerciseId: number;
  assignmentId?: number | null;
  score?: number | null;
  teacherScore?: number | null;
  maxScore?: number;
  /** undefined = mặc định [{type:"vocab"}]; null = NULL trong DB. */
  errors?: unknown;
  minute: number;
}) => {
  const errors =
    opts.errors === undefined
      ? ([{ type: "vocab" }] as Prisma.InputJsonValue)
      : opts.errors === null
        ? Prisma.DbNull
        : (opts.errors as Prisma.InputJsonValue);
  const row = await prisma.attempt.create({
    data: {
      studentId: opts.studentId,
      exerciseId: opts.exerciseId,
      assignmentId: opts.assignmentId ?? null,
      answer: ["goes"],
      score: opts.score ?? null,
      teacherScore: opts.teacherScore ?? null,
      ...(opts.maxScore !== undefined ? { maxScore: opts.maxScore } : {}),
      errors,
      submittedAt: at(opts.minute),
    },
    select: { id: true },
  });
  return row.id;
};

/** Tạo 1 attempt tự luyện trên 1 bài MỚI (mỗi lần gọi = 1 phần tử đại diện riêng). */
const selfPractice = async (
  studentId: number,
  skill: Skill,
  score: number | null,
  minute: number,
  errors?: unknown
) => {
  const exerciseId = await newExercise(skill);
  return newAttempt({ studentId, exerciseId, score, minute, errors });
};

const getProfiles = (studentId: number) =>
  prisma.skillProfile.findMany({ where: { studentId } });

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  // Thứ tự theo khóa ngoại: attempt -> bài giao -> lớp -> bài -> user (skill_profiles tự cascade theo user).
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.assignment.deleteMany({ where: { assignedById: { in: userIds } } });
  await prisma.class.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;

  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((user) => user.id));

  ids.teacher = await createUser("teacher", "TEACHER");

  const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
  const cls = await prisma.class.create({
    data: { name: `${RUN_ID} class`, code, teacherId: ids.teacher },
    select: { id: true },
  });
  ids.classId = cls.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanup([ids.teacher, ...studentIds].filter((id) => id > 0));
  await prisma.$disconnect();
});

describe("recomputeSkillProfile - tạo hồ sơ", () => {
  it("HS chưa có hồ sơ + 3 bài hợp lệ -> tạo đúng 1 dòng (score, level, error_stats, updated_at)", async () => {
    const s = await newStudent();
    await selfPractice(s, "READING", 6, 1, [{ type: "vocab" }, { type: "grammar" }]);
    await selfPractice(s, "READING", 8, 2, [{ type: "vocab" }]);
    await selfPractice(s, "READING", 10, 3, []);

    expect(await getProfiles(s)).toHaveLength(0);

    const before = Date.now();
    const result = await recomputeSkillProfile(prisma, s, "READING");

    const rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].skill).toBe("READING");
    expect(rows[0].score).toBe(8); // (6 + 8 + 10) / 3
    expect(rows[0].level).toBe("B2"); // >= 8
    expect(rows[0].errorStats).toEqual({ vocab: 2, grammar: 1 });
    expect(rows[0].updatedAt.getTime()).toBeGreaterThanOrEqual(before - 2000);

    // Giá trị trả về khớp dòng trong DB.
    expect(result).not.toBeNull();
    expect(result?.score).toBe(8);
    expect(result?.level).toBe("B2");
  });

  it("dưới MIN_SAMPLES (1, 2 điểm) -> có score nhưng level NULL; đúng 3 điểm -> có mức", async () => {
    const s = await newStudent();

    await selfPractice(s, "LISTENING", 9, 1);
    await recomputeSkillProfile(prisma, s, "LISTENING");
    let rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(9);
    expect(rows[0].level).toBeNull();

    await selfPractice(s, "LISTENING", 9, 2);
    await recomputeSkillProfile(prisma, s, "LISTENING");
    rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(9);
    expect(rows[0].level).toBeNull();

    await selfPractice(s, "LISTENING", 9, 3);
    await recomputeSkillProfile(prisma, s, "LISTENING");
    rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(9);
    expect(rows[0].level).toBe("B2");
  });
});

describe("recomputeSkillProfile - chọn attempt đại diện", () => {
  it("bài giao nộp 3 lần: chỉ lần điểm cao nhất vào score và error_stats; teacher_score đổi đại diện", async () => {
    const s = await newStudent();
    const ex = await newExercise("READING");
    const assignmentId = await newAssignment(ex);

    await newAttempt({
      studentId: s,
      exerciseId: ex,
      assignmentId,
      score: 4,
      errors: [{ type: "A" }, { type: "A" }],
      minute: 1,
    });
    await newAttempt({
      studentId: s,
      exerciseId: ex,
      assignmentId,
      score: 9,
      errors: [{ type: "B" }],
      minute: 2,
    });
    const third = await newAttempt({
      studentId: s,
      exerciseId: ex,
      assignmentId,
      score: 6,
      errors: [{ type: "C" }],
      minute: 3,
    });

    await recomputeSkillProfile(prisma, s, "READING");
    let rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(9);
    expect(rows[0].errorStats).toEqual({ B: 1 }); // không đếm lỗi A (lần thấp)

    // GV ghi đè điểm lần 3 thành 10 -> đại diện đổi sang lần 3.
    await prisma.attempt.update({ where: { id: third }, data: { teacherScore: 10 } });
    await recomputeSkillProfile(prisma, s, "READING");
    rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(10);
    expect(rows[0].errorStats).toEqual({ C: 1 });
  });

  it("tự luyện làm lại cùng bài = 1 phần tử; bài giao + tự luyện cùng exercise = 2 phần tử", async () => {
    const s = await newStudent();
    const ex = await newExercise("WRITING");
    const assignmentId = await newAssignment(ex);

    // Tự luyện cùng bài 2 lần -> chỉ lần điểm cao (7) là đại diện.
    await newAttempt({ studentId: s, exerciseId: ex, score: 5, errors: [{ type: "x" }], minute: 1 });
    await newAttempt({ studentId: s, exerciseId: ex, score: 7, errors: [{ type: "x" }], minute: 2 });
    // Bài giao cùng exercise -> phần tử thứ 2.
    await newAttempt({
      studentId: s,
      exerciseId: ex,
      assignmentId,
      score: 3,
      errors: [{ type: "x" }],
      minute: 3,
    });

    await recomputeSkillProfile(prisma, s, "WRITING");
    const rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(5); // (7 + 3) / 2
    expect(rows[0].level).toBeNull(); // chỉ 2 mẫu
    expect(rows[0].errorStats).toEqual({ x: 2 }); // 2 phần tử, mỗi phần tử 1 lỗi
  });
});

describe("recomputeSkillProfile - cửa sổ và dữ liệu không hợp lệ", () => {
  it("hơn N bài -> chỉ N gần nhất vào score và error_stats (windowSize qua opts)", async () => {
    const s = await newStudent();
    // minute 1..5, điểm 1,2,3,9,10; mỗi attempt có 1 loại lỗi riêng e1..e5.
    const scores = [1, 2, 3, 9, 10];
    for (let i = 0; i < scores.length; i += 1) {
      await selfPractice(s, "SPEAKING", scores[i], i + 1, [{ type: `e${i + 1}` }]);
    }

    await recomputeSkillProfile(prisma, s, "SPEAKING", { windowSize: 3 });
    const rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(7.33); // (10 + 9 + 3) / 3 = 7.333...
    expect(rows[0].level).toBe("B1");
    expect(rows[0].errorStats).toEqual({ e5: 1, e4: 1, e3: 1 });
  });

  it("attempt chưa chấm (score NULL) và điểm ngoài [0, 10] bị bỏ", async () => {
    const s = await newStudent();
    await selfPractice(s, "READING", 6, 1, [{ type: "ok1" }]);
    await selfPractice(s, "READING", 8, 2, [{ type: "ok2" }]);
    await selfPractice(s, "READING", 10, 3, [{ type: "ok3" }]);
    // Mới nhất nhưng KHÔNG hợp lệ: chưa chấm, và điểm 50 (maxScore 100 để qua CHECK của DB).
    await selfPractice(s, "READING", null, 4, [{ type: "bad1" }]);
    const exBig = await newExercise("READING");
    await newAttempt({
      studentId: s,
      exerciseId: exBig,
      score: 50,
      maxScore: 100,
      errors: [{ type: "bad2" }],
      minute: 5,
    });

    await recomputeSkillProfile(prisma, s, "READING");
    const rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(8);
    expect(rows[0].level).toBe("B2");
    expect(rows[0].errorStats).toEqual({ ok1: 1, ok2: 1, ok3: 1 });
  });

  it("errors rỗng, null hoặc phần tử hỏng không làm vỡ hàm", async () => {
    const s = await newStudent();
    await selfPractice(s, "FOUNDATION", 5, 1, []);
    await selfPractice(s, "FOUNDATION", 5, 2, null);
    await selfPractice(s, "FOUNDATION", 5, 3, [123, null, "text", { type: "" }, { type: "   " }, { type: "ok" }]);

    await recomputeSkillProfile(prisma, s, "FOUNDATION");
    const rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(5);
    expect(rows[0].errorStats).toEqual({ ok: 1 });
  });
});

describe("recomputeSkillProfile - tách kỹ năng và học sinh", () => {
  it("chỉ đúng kỹ năng được tính; HS khác không ảnh hưởng; FOUNDATION có hồ sơ riêng", async () => {
    const a = await newStudent();
    const b = await newStudent();

    for (let i = 1; i <= 3; i += 1) {
      await selfPractice(a, "READING", 6, i, [{ type: "r" }]);
      await selfPractice(a, "FOUNDATION", 2, i + 10, [{ type: "f" }]);
      await selfPractice(b, "READING", 10, i + 20, [{ type: "b" }]);
    }

    await recomputeSkillProfile(prisma, a, "READING");
    await recomputeSkillProfile(prisma, a, "FOUNDATION");

    const aRows = await getProfiles(a);
    expect(aRows).toHaveLength(2);
    const aReading = aRows.find((r) => r.skill === "READING");
    const aFoundation = aRows.find((r) => r.skill === "FOUNDATION");
    expect(aReading?.score).toBe(6);
    expect(aReading?.errorStats).toEqual({ r: 3 });
    expect(aFoundation?.score).toBe(2);
    expect(aFoundation?.errorStats).toEqual({ f: 3 });

    // B chưa được tính lại -> chưa có dòng nào.
    expect(await getProfiles(b)).toHaveLength(0);

    await recomputeSkillProfile(prisma, b, "READING");
    const bRows = await getProfiles(b);
    expect(bRows).toHaveLength(1);
    expect(bRows[0].score).toBe(10);

    // Hồ sơ của A không đổi.
    const aAfter = await getProfiles(a);
    expect(aAfter.find((r) => r.skill === "READING")?.score).toBe(6);
  });
});

describe("recomputeSkillProfile - lặp lại và song song", () => {
  it("gọi 2 lần liên tiếp cùng dữ liệu -> score, level, error_stats giống hệt, vẫn 1 dòng", async () => {
    const s = await newStudent();
    await selfPractice(s, "READING", 7, 1, [{ type: "a" }]);
    await selfPractice(s, "READING", 8, 2, [{ type: "b" }]);
    await selfPractice(s, "READING", 9, 3, [{ type: "a" }]);

    await recomputeSkillProfile(prisma, s, "READING");
    const first = (await getProfiles(s))[0];
    await recomputeSkillProfile(prisma, s, "READING");
    const rows = await getProfiles(s);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].score).toBe(first.score);
    expect(rows[0].level).toBe(first.level);
    expect(rows[0].errorStats).toEqual(first.errorStats);
    expect(rows[0].score).toBe(8);
    expect(rows[0].errorStats).toEqual({ a: 2, b: 1 });
  });

  it("nhiều lần gọi song song (Promise.all) -> vẫn 1 dòng, giá trị khớp dữ liệu cuối", async () => {
    const s = await newStudent();
    await selfPractice(s, "LISTENING", 4, 1, [{ type: "p" }]);
    await selfPractice(s, "LISTENING", 6, 2, [{ type: "p" }]);
    await selfPractice(s, "LISTENING", 8, 3, [{ type: "q" }]);

    const results = await Promise.all([
      recomputeSkillProfile(prisma, s, "LISTENING"),
      recomputeSkillProfile(prisma, s, "LISTENING"),
      recomputeSkillProfile(prisma, s, "LISTENING"),
      recomputeSkillProfile(prisma, s, "LISTENING"),
    ]);
    results.forEach((r) => expect(r).not.toBeNull());

    const rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(6); // (4 + 6 + 8) / 3
    expect(rows[0].level).toBe("B1");
    expect(rows[0].errorStats).toEqual({ p: 2, q: 1 });
  });

  it("chạy được bên trong transaction có sẵn (không lồng thêm)", async () => {
    const s = await newStudent();
    await selfPractice(s, "READING", 5, 1);
    await selfPractice(s, "READING", 5, 2);
    await selfPractice(s, "READING", 5, 3);

    const result = await prisma.$transaction((tx) => recomputeSkillProfile(tx, s, "READING"));
    expect(result?.score).toBe(5);

    const rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(5);
    expect(rows[0].level).toBe("A2");
  });

  it("windowSize không hợp lệ -> RangeError", async () => {
    const s = await newStudent();
    await expect(recomputeSkillProfile(prisma, s, "READING", { windowSize: 0 })).rejects.toThrow(
      RangeError
    );
    await expect(recomputeSkillProfile(prisma, s, "READING", { windowSize: 1.5 })).rejects.toThrow(
      RangeError
    );
  });
});

describe("recomputeSkillProfile - không còn điểm hợp lệ", () => {
  it("chưa có dòng -> trả null và không tạo dòng", async () => {
    const s = await newStudent();
    await selfPractice(s, "READING", null, 1); // chỉ có attempt chưa chấm

    const result = await recomputeSkillProfile(prisma, s, "READING");
    expect(result).toBeNull();
    expect(await getProfiles(s)).toHaveLength(0);
  });

  it("HS không có attempt nào -> trả null, không tạo dòng", async () => {
    const s = await newStudent();
    expect(await recomputeSkillProfile(prisma, s, "SPEAKING")).toBeNull();
    expect(await getProfiles(s)).toHaveLength(0);
  });

  it("đã có dòng -> giữ nguyên dòng cũ (không ghi gì)", async () => {
    const s = await newStudent();
    await selfPractice(s, "READING", null, 1);

    const old = await prisma.skillProfile.create({
      data: {
        studentId: s,
        skill: "READING",
        score: 5,
        level: "A2",
        errorStats: { x: 1 },
      },
    });

    const result = await recomputeSkillProfile(prisma, s, "READING");
    expect(result).toBeNull();

    const rows = await getProfiles(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(5);
    expect(rows[0].level).toBe("A2");
    expect(rows[0].errorStats).toEqual({ x: 1 });
    expect(rows[0].updatedAt.getTime()).toBe(old.updatedAt.getTime());
  });
});

describe("recomputeSkillProfile - log", () => {
  it("khi lỗi chỉ log studentId, skill, số attempt; không chứa errors hay nội dung bài; lỗi được ném lại", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const rowsWithSecrets = [1, 2, 3].map((n) => ({
      id: n,
      exerciseId: n,
      assignmentId: null,
      score: 5,
      teacherScore: null,
      submittedAt: at(n),
      errors: [{ type: "SECRET_TYPE", text: "SECRET_TEXT", answer: "SECRET_ANSWER" }],
    }));

    // db giả (không phải client gốc): lấy khóa và đọc attempt OK, nhưng upsert ném lỗi.
    const fakeDb = {
      $executeRaw: async () => 1,
      attempt: { findMany: async () => rowsWithSecrets },
      skillProfile: {
        upsert: async () => {
          throw new Error("boom");
        },
      },
    } as unknown as Prisma.TransactionClient;

    await expect(recomputeSkillProfile(fakeDb, 123, "READING")).rejects.toThrow("boom");

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("123");
    expect(logged).toContain("READING");
    expect(logged).toContain("3"); // số attempt đã đọc
    expect(logged).not.toContain("SECRET");
  });
});