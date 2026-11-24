import { randomUUID } from "node:crypto";
import { Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { getAdminUserDetail } from "./admin.users.detail.service";

// Test DB: cần PostgreSQL thật (giống các test *.db.test.ts khác).
// Mọi dữ liệu tạo ra đều gắn RUN_ID và bị xóa ở afterAll.
const RUN_ID = `t29d_${randomUUID().replaceAll("-", "")}`;

// Thời điểm "bây giờ" cố định: 2026-11-24 12:00 giờ VN.
// Ngày VN này bắt đầu 2026-11-23T17:00:00.000Z và kết thúc (không tính) 2026-11-24T17:00:00.000Z.
const NOW = new Date("2026-11-24T05:00:00.000Z");
const DAY_START = new Date("2026-11-23T17:00:00.000Z");
const NEXT_DAY_START = new Date("2026-11-24T17:00:00.000Z");

type Ids = Record<"student" | "teacher" | "empty" | "other" | "admin", number>;
let ids: Ids;
const exerciseIds: number[] = [];
const classIds: number[] = [];

const ms = (date: Date, delta: number) => new Date(date.getTime() + delta);

async function createUser(key: string, role: Role, status: UserStatus = UserStatus.ACTIVE) {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${key}`,
      email: `${RUN_ID}-${key}@example.test`,
      passwordHash: "not-a-real-hash",
      role,
      status,
    },
    select: { id: true },
  });
  return user.id;
}

async function createExercise(createdById: number, tag: string) {
  const row = await prisma.exercise.create({
    data: {
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: `${RUN_ID} ${tag}`,
      content: { text: "She ___ to school." },
      answer: ["goes"],
      status: "DRAFT",
      source: "TEACHER",
      createdById,
    },
    select: { id: true },
  });
  exerciseIds.push(row.id);
  return row.id;
}

async function createClass(teacherId: number, tag: string, studentIds: number[]) {
  const row = await prisma.class.create({
    data: {
      name: `${RUN_ID} ${tag}`,
      code: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(),
      teacherId,
      members: { create: studentIds.map((studentId) => ({ studentId })) },
    },
    select: { id: true },
  });
  classIds.push(row.id);
  return row.id;
}

const attempt = (studentId: number, exerciseId: number, submittedAt: Date) =>
  prisma.attempt.create({
    data: { studentId, exerciseId, answer: ["goes"], submittedAt },
  });

const aiLog = (userId: number, status: string, createdAt: Date) =>
  prisma.aiUsageLog.create({ data: { userId, task: "test", status, createdAt } });

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test chi tiết user.");
  }

  ids = {
    student: await createUser("student", Role.STUDENT),
    teacher: await createUser("teacher", Role.TEACHER),
    empty: await createUser("empty", Role.STUDENT, UserStatus.LOCKED),
    other: await createUser("other", Role.STUDENT),
    admin: await createUser("admin", Role.ADMIN),
  };

  // Giáo viên: dạy 2 lớp, tạo 2 bài. HS học 2 lớp (cả hai của GV này).
  await createClass(ids.teacher, "class-1", [ids.student, ids.other]);
  await createClass(ids.teacher, "class-2", [ids.student]);
  const exOne = await createExercise(ids.teacher, "ex-1");
  const exTwo = await createExercise(ids.teacher, "ex-2");

  // HS có 3 bài nộp; bài mới nhất lúc 2026-11-24T03:00Z.
  const latestAttempt = new Date("2026-11-24T03:00:00.000Z");
  await attempt(ids.student, exOne, new Date("2026-11-01T01:00:00.000Z"));
  await attempt(ids.student, exTwo, new Date("2026-11-10T01:00:00.000Z"));
  await attempt(ids.student, exOne, latestAttempt);

  // Lượt AI của HS ở mọi status, sát biên ngày:
  //  - đúng 00:00 giờ VN (DAY_START)        -> TÍNH vào today
  //  - trước đó 1 ms                          -> KHÔNG tính vào today
  //  - 1 ms trước mốc ngày kế (NEXT_DAY_START) -> tính vào today
  //  - đúng NEXT_DAY_START                    -> KHÔNG tính vào today
  // Lượt AI mới nhất là dòng ở NEXT_DAY_START, lớn hơn bài nộp mới nhất.
  await aiLog(ids.student, "ok", DAY_START);
  await aiLog(ids.student, "error", ms(DAY_START, -1));
  await aiLog(ids.student, "cached", ms(NEXT_DAY_START, -1));
  await aiLog(ids.student, "rate_limited", NEXT_DAY_START);
  await aiLog(ids.student, "ok", new Date("2026-11-24T10:00:00.000Z"));

  // Dữ liệu của user khác (mới hơn, nhiều hơn) KHÔNG được lẫn vào HS.
  await attempt(ids.other, exOne, new Date("2026-11-24T04:00:00.000Z"));
  await aiLog(ids.other, "ok", new Date("2026-11-24T09:00:00.000Z"));
  await aiLog(ids.other, "ok", new Date("2026-11-24T09:30:00.000Z"));
});

afterAll(async () => {
  if (!ids) return;
  const userIds = Object.values(ids);
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.aiUsageLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("getAdminUserDetail", () => {
  it("HS có lớp + bài nộp + lượt AI: số liệu đúng", async () => {
    const detail = await getAdminUserDetail(ids.student, NOW);

    expect(detail).toMatchObject({
      id: ids.student,
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
      stats: {
        classesTeaching: 0,
        classesJoined: 2,
        attemptsCount: 3,
        exercisesCreated: 0,
        // total: đủ 5 dòng, kể cả cached và rate_limited
        // today: ok(DAY_START) + cached(NEXT-1ms) + ok(10:00Z) = 3
        aiRequests: { total: 5, today: 3 },
        // lượt AI mới nhất là dòng rate_limited ở NEXT_DAY_START (24T17:00Z),
        // lớn hơn bài nộp mới nhất (24T03:00Z); lastActivityAt đếm mọi status
        lastActivityAt: NEXT_DAY_START,
      },
    });
  });

  it("GV có lớp + bài tạo: classesTeaching và exercisesCreated đúng", async () => {
    const detail = await getAdminUserDetail(ids.teacher, NOW);

    expect(detail.stats).toEqual({
      classesTeaching: 2,
      classesJoined: 0,
      attemptsCount: 0,
      exercisesCreated: 2,
      aiRequests: { total: 0, today: 0 },
      lastActivityAt: null,
    });
  });

  it("user chưa có dữ liệu (kể cả đang LOCKED): toàn 0 và lastActivityAt null", async () => {
    const detail = await getAdminUserDetail(ids.empty, NOW);

    expect(detail.status).toBe(UserStatus.LOCKED);
    expect(detail.stats).toEqual({
      classesTeaching: 0,
      classesJoined: 0,
      attemptsCount: 0,
      exercisesCreated: 0,
      aiRequests: { total: 0, today: 0 },
      lastActivityAt: null,
    });
  });

  it("xem được ADMIN khác", async () => {
    const detail = await getAdminUserDetail(ids.admin, NOW);
    expect(detail.role).toBe(Role.ADMIN);
  });

  it("biên 'hôm nay': đúng 00:00 giờ VN tính, trước đó 1 ms thì không", async () => {
    // Hai thời điểm "bây giờ" khác nhau trong cùng một ngày VN phải cho cùng kết quả.
    const atStart = await getAdminUserDetail(ids.student, DAY_START);
    const atEnd = await getAdminUserDetail(ids.student, ms(NEXT_DAY_START, -1));
    expect(atStart.stats.aiRequests).toEqual({ total: 5, today: 3 });
    expect(atEnd.stats.aiRequests).toEqual({ total: 5, today: 3 });

    // Sang ngày VN trước (now = 1 ms trước DAY_START): chỉ còn dòng error ở ms(DAY_START, -1).
    const previousDay = await getAdminUserDetail(ids.student, ms(DAY_START, -1));
    expect(previousDay.stats.aiRequests).toEqual({ total: 5, today: 1 });

    // Sang ngày VN kế (now = NEXT_DAY_START): chỉ còn dòng rate_limited ở đúng NEXT_DAY_START.
    const nextDay = await getAdminUserDetail(ids.student, NEXT_DAY_START);
    expect(nextDay.stats.aiRequests).toEqual({ total: 5, today: 1 });
  });

  it("dữ liệu của user khác không lẫn vào", async () => {
    const other = await getAdminUserDetail(ids.other, NOW);
    expect(other.stats).toMatchObject({
      classesJoined: 1,
      attemptsCount: 1,
      aiRequests: { total: 2, today: 2 },
      lastActivityAt: new Date("2026-11-24T09:30:00.000Z"),
    });
  });

  it("mọi số liệu là số nguyên không âm", async () => {
    for (const id of Object.values(ids)) {
      const { stats } = await getAdminUserDetail(id, NOW);
      const numbers = [
        stats.classesTeaching,
        stats.classesJoined,
        stats.attemptsCount,
        stats.exercisesCreated,
        stats.aiRequests.total,
        stats.aiRequests.today,
      ];
      for (const value of numbers) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("response không có passwordHash hay field ngoài danh sách", async () => {
    const detail = await getAdminUserDetail(ids.student, NOW);
    expect(Object.keys(detail).sort()).toEqual(
      ["createdAt", "email", "id", "name", "role", "stats", "status"].sort()
    );
    expect(JSON.stringify(detail)).not.toContain("passwordHash");
    expect(JSON.stringify(detail)).not.toContain("not-a-real-hash");
  });

  it("id không tồn tại → 404 USER_NOT_FOUND", async () => {
    await expect(getAdminUserDetail(2_147_483_000, NOW)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  it("không ghi gì vào DB (audit_logs không đổi)", async () => {
    const before = await prisma.auditLog.count();
    await getAdminUserDetail(ids.student, NOW);
    expect(await prisma.auditLog.count()).toBe(before);
  });
});