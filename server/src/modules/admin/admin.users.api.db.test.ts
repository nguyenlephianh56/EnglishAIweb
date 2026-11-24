import { randomUUID } from "node:crypto";
import { Role, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import {
  authorizationHeaders,
  createAuthorizationFixtures,
  startAuthorizationApp,
} from "../../testing/authorization-fixtures";
import { USER_SEARCH_MAX_LENGTH } from "./admin.schema";

// Test API cho T29 (việc "Xem"): GET /admin/users/:id và GET /admin/users?q=
// Cần PostgreSQL thật. Dữ liệu thêm vào đều gắn `scope` (chỉ chữ + số, KHÔNG có dấu _ hay %
// để các test q=_ và q=% không bị nhiễu) và bị xóa ở afterAll.

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Row = { id: number; name: string; email: string; role: string; status: string; createdAt: string };
type Created = { id: number; role: Role; status: UserStatus };

let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;
let deletedAdminHeaders: ReturnType<typeof authorizationHeaders>;
let adminPending: Created;
let adminLocked: Created;
const scope = `t29u${randomUUID().replaceAll("-", "")}`;
const created: Record<string, Created> = {};
let createdOrder: string[] = []; // thứ tự tạo (createdAt tăng dần)
const aiLogIds: number[] = [];

async function createUser(key: string, role: Role, status: UserStatus, index: number, label = key) {
  const user = await prisma.user.create({
    data: {
      name: `${scope} ${label}`,
      email: `${scope}-${key}@example.test`,
      passwordHash: "not-a-real-hash",
      role,
      status,
      // createdAt cách nhau 1 phút để thứ tự "mới nhất trước" là xác định (không bị trùng ms)
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    },
    select: { id: true, role: true, status: true },
  });
  created[key] = user;
  createdOrder.push(key);
  return user;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test API users.");
  }

  fixtures = await createAuthorizationFixtures();

  // Dữ liệu cho test tìm kiếm (thứ tự tạo = thứ tự createdAt tăng dần)
  await createUser("alice", Role.STUDENT, UserStatus.ACTIVE, 1, "Alice Nguyen");
  await createUser("bob", Role.TEACHER, UserStatus.ACTIVE, 2, "Bob Tran");
  await createUser("cara", Role.TEACHER, UserStatus.PENDING, 3, "Cara Le");
  await createUser("pct", Role.STUDENT, UserStatus.ACTIVE, 4, "Pct%Sign");
  await createUser("under", Role.STUDENT, UserStatus.ACTIVE, 5, "Under_Score");
  await createUser("back", Role.STUDENT, UserStatus.ACTIVE, 6, "Back\\Slash");
  adminPending = await createUser("adminpending", Role.ADMIN, UserStatus.PENDING, 7);
  adminLocked = await createUser("adminlocked", Role.ADMIN, UserStatus.LOCKED, 8);

  // Admin tạm để thử token của tài khoản đã bị xóa
  const deletedAdmin = await createUser("deletedadmin", Role.ADMIN, UserStatus.ACTIVE, 9);
  deletedAdminHeaders = authorizationHeaders(deletedAdmin);
  await prisma.user.delete({ where: { id: deletedAdmin.id } });
  delete created.deletedadmin;
  createdOrder = createdOrder.filter((key) => key !== "deletedadmin");

  // Một lượt AI cho studentA để kiểm số liệu qua API
  const log = await prisma.aiUsageLog.create({
    data: { userId: fixtures.actors.studentA.id, task: "test", status: "ok" },
    select: { id: true },
  });
  aiLogIds.push(log.id);

  app = await startAuthorizationApp(fixtures.forbiddenValues);
});

afterAll(async () => {
  await app?.close();
  if (!fixtures) return;
  await prisma.aiUsageLog.deleteMany({ where: { id: { in: aiLogIds } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(created).map((user) => user.id) } } });
  await fixtures.cleanup();
});

// Email là field hợp lệ của response nên KHÔNG đưa email vào forbiddenValues.
const leakChecks = { forbiddenKeys: ["password", "token", "authorization", "api_key", "answer", "content"] };

function request(path: string, headers?: HeadersInit) {
  return app.request(path, { headers }, leakChecks);
}
const asAdmin = (path: string) => request(path, authorizationHeaders(fixtures.actors.admin));
const expectedError = (status: number, code: string) => ({
  status,
  body: { data: null, error: { code, message: expect.any(String) } },
});

const detailKeys = ["createdAt", "email", "id", "name", "role", "stats", "status"];
const statsKeys = ["aiRequests", "attemptsCount", "classesJoined", "classesTeaching", "exercisesCreated", "lastActivityAt"];
const listKeys = ["createdAt", "email", "id", "name", "role", "status"];

// Tập quyền dùng chung cho cả hai endpoint
function describeAccess(label: string, path: () => string) {
  describe(`${label}: xác thực và phân quyền`, () => {
    it("401 khi thiếu token hoặc tài khoản trong token đã bị xóa", async () => {
      expect(await request(path())).toEqual(expectedError(401, "UNAUTHORIZED"));
      expect(await request(path(), deletedAdminHeaders)).toEqual(expectedError(401, "UNAUTHORIZED"));
    });

    it("401 khi token hết hạn hoặc sai chữ ký", async () => {
      const admin = fixtures.actors.admin;
      expect(await request(path(), authorizationHeaders(admin, -60))).toEqual(expectedError(401, "INVALID_TOKEN"));
      const wrongKey = jwt.sign({ userId: admin.id }, randomUUID());
      expect(await request(path(), { Authorization: `Bearer ${wrongKey}` })).toEqual(
        expectedError(401, "INVALID_TOKEN")
      );
    });

    it.each(["studentA", "teacherA", "pendingTeacher", "lockedTeacher"] as const)("%s nhận 403", async (actor) => {
      expect(await request(path(), authorizationHeaders(fixtures.actors[actor]))).toEqual(
        expectedError(403, "FORBIDDEN")
      );
    });

    it("admin PENDING hoặc LOCKED nhận 403", async () => {
      expect(await request(path(), authorizationHeaders(adminPending))).toEqual(expectedError(403, "FORBIDDEN"));
      expect(await request(path(), authorizationHeaders(adminLocked))).toEqual(expectedError(403, "FORBIDDEN"));
    });
  });
}

describeAccess("GET /admin/users/:id", () => `/admin/users/${fixtures.actors.teacherA.id}`);

describe("GET /api/v1/admin/users/:id", () => {
  it("ADMIN xem được GV: hồ sơ + số liệu đúng, không có field ngoài danh sách", async () => {
    const teacher = fixtures.actors.teacherA;
    const response = await asAdmin(`/admin/users/${teacher.id}`);

    expect(response.status).toBe(200);
    const { data, error } = response.body as { data: Record<string, unknown>; error: unknown };
    expect(error).toBeNull();
    expect(Object.keys(data).sort()).toEqual(detailKeys);
    expect(Object.keys(data.stats as object).sort()).toEqual(statsKeys);
    expect(data).toMatchObject({
      id: teacher.id,
      email: teacher.email,
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
      stats: {
        classesTeaching: 1,
        classesJoined: 0,
        attemptsCount: 0,
        exercisesCreated: 0,
        aiRequests: { total: 0, today: 0 },
        lastActivityAt: null,
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordhash|password_hash|not-a-real-hash/i);
  });

  it("ADMIN xem được HS có lớp và lượt AI", async () => {
    const response = await asAdmin(`/admin/users/${fixtures.actors.studentA.id}`);
    expect(response.status).toBe(200);
    const stats = (response.body as { data: { stats: Record<string, unknown> } }).data.stats;
    expect(stats).toMatchObject({ classesTeaching: 0, classesJoined: 1, attemptsCount: 0, exercisesCreated: 0 });
    expect((stats.aiRequests as { total: number }).total).toBe(1);
    expect(typeof stats.lastActivityAt).toBe("string"); // ISO, lấy từ lượt AI
  });

  it("ADMIN xem được ADMIN khác, user PENDING và LOCKED", async () => {
    for (const target of [adminPending, adminLocked, fixtures.actors.pendingTeacher, fixtures.actors.lockedTeacher]) {
      const response = await asAdmin(`/admin/users/${target.id}`);
      expect(response.status).toBe(200);
      expect((response.body as { data: { id: number; status: string } }).data).toMatchObject({
        id: target.id,
        status: target.status,
      });
    }
  });

  it("id không tồn tại → 404 USER_NOT_FOUND", async () => {
    expect(await asAdmin("/admin/users/2147483000")).toEqual(expectedError(404, "USER_NOT_FOUND"));
  });

  it.each(["0", "-1", "abc", "1.5"])("id=%s → 400 VALIDATION_ERROR", async (id) => {
    expect(await asAdmin(`/admin/users/${id}`)).toEqual(expectedError(400, "VALIDATION_ERROR"));
  });
});

describeAccess("GET /admin/users?q=", () => `/admin/users?q=${scope}`);

describe("GET /api/v1/admin/users?q=", () => {
  const list = async (query: string) => {
    const response = await asAdmin(`/admin/users${query}`);
    expect(response.status).toBe(200);
    return (response.body as { data: Row[] }).data;
  };
  const q = (value: string, extra = "") => `?q=${encodeURIComponent(value)}${extra}`;
  const idsOf = (rows: Row[]) => rows.map((row) => row.id);
  const idOf = (...keys: string[]) => keys.map((key) => created[key].id);

  it("403 được kiểm trước khi kiểm q", async () => {
    const tooLong = "a".repeat(USER_SEARCH_MAX_LENGTH + 1);
    expect(await request(`/admin/users?q=${tooLong}`, authorizationHeaders(fixtures.actors.studentA))).toEqual(
      expectedError(403, "FORBIDDEN")
    );
  });

  it("tìm theo tên, không phân biệt hoa/thường, khớp một phần", async () => {
    expect(idsOf(await list(q(`${scope} alice`)))).toEqual(idOf("alice"));
    expect(idsOf(await list(q(`${scope.toUpperCase()} ALICE`)))).toEqual(idOf("alice"));
    expect(idsOf(await list(q(`ice Nguy`)))).toContain(created.alice.id);
  });

  it("tìm theo email, không phân biệt hoa/thường, khớp một phần", async () => {
    expect(idsOf(await list(q(`${scope}-bob@`)))).toEqual(idOf("bob"));
    expect(idsOf(await list(q(`${scope.toUpperCase()}-BOB@EXAMPLE`)))).toEqual(idOf("bob"));
  });

  it("q chung của scope trả đúng các user đã tạo, mới nhất trước, đúng các field cũ", async () => {
    const rows = await list(q(scope));
    const expected = [...createdOrder].reverse().map((key) => created[key].id);
    expect(idsOf(rows)).toEqual(expected);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(listKeys);
    const times = rows.map((row) => new Date(row.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("kết hợp AND với role và status", async () => {
    expect(idsOf(await list(q(scope, "&role=TEACHER")))).toEqual(idOf("cara", "bob"));
    expect(idsOf(await list(q(scope, "&role=TEACHER&status=PENDING")))).toEqual(idOf("cara"));
    expect(idsOf(await list(q(scope, "&status=LOCKED")))).toEqual(idOf("adminlocked"));
    expect(await list(q(`${scope} Alice`, "&role=TEACHER"))).toEqual([]);
  });

  it("q rỗng hoặc toàn khoảng trắng = không lọc", async () => {
    const everyone = [...Object.values(created).map((user) => user.id), ...Object.values(fixtures.actors).map((actor) => actor.id)];
    for (const query of ["?q=", "?q=%20%20%20", "?q=%09"]) {
      expect(idsOf(await list(query))).toEqual(expect.arrayContaining(everyone));
    }
  });

  it("q có khoảng trắng hai đầu được cắt trước khi tìm", async () => {
    expect(idsOf(await list(q(`  ${scope}-bob@  `)))).toEqual(idOf("bob"));
  });

  it("100 ký tự được, 101 ký tự → 400", async () => {
    expect(await list(q("a".repeat(USER_SEARCH_MAX_LENGTH)))).toEqual(expect.any(Array));
    expect(await asAdmin(`/admin/users${q("a".repeat(USER_SEARCH_MAX_LENGTH + 1))}`)).toEqual(
      expectedError(400, "VALIDATION_ERROR")
    );
  });

  it("q gửi nhiều lần → 400", async () => {
    expect(await asAdmin("/admin/users?q=a&q=b")).toEqual(expectedError(400, "VALIDATION_ERROR"));
  });

  it("q=% chỉ khớp ký tự % theo nghĩa đen", async () => {
    const rows = await list(q("%"));
    expect(idsOf(rows)).toContain(created.pct.id);
    expect(idsOf(rows)).not.toContain(created.alice.id);
    for (const row of rows) expect(`${row.name} ${row.email}`).toContain("%");
  });

  it("q=_ chỉ khớp ký tự _ theo nghĩa đen", async () => {
    const rows = await list(q("_"));
    expect(idsOf(rows)).toContain(created.under.id);
    expect(idsOf(rows)).not.toContain(created.alice.id);
    for (const row of rows) expect(`${row.name} ${row.email}`).toContain("_");
  });

  it("q=\\ chỉ khớp ký tự \\ theo nghĩa đen", async () => {
    const rows = await list(q("\\"));
    expect(idsOf(rows)).toContain(created.back.id);
    expect(idsOf(rows)).not.toContain(created.alice.id);
    for (const row of rows) expect(`${row.name} ${row.email}`).toContain("\\");
  });

  it("q=%scope% không biến % thành ký tự đại diện", async () => {
    expect(await list(q(`%${scope}%`))).toEqual([]);
  });

  it("không có kết quả → [] với 200", async () => {
    expect(await asAdmin(`/admin/users${q(`${scope}-khong-co`)}`)).toEqual({
      status: 200,
      body: { data: [], error: null },
    });
  });

  it("không có q: vẫn là mảng với đúng các field cũ", async () => {
    const rows = await list("");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(listKeys);
  });
});

describe("hai endpoint chỉ đọc", () => {
  it("không tạo dòng audit_logs và không đổi dữ liệu user", async () => {
    const targetId = fixtures.actors.teacherA.id;
    const auditBefore = await prisma.auditLog.count();
    const userBefore = await prisma.user.findUnique({ where: { id: targetId } });

    expect((await asAdmin(`/admin/users/${targetId}`)).status).toBe(200);
    expect((await asAdmin(`/admin/users?q=${scope}`)).status).toBe(200);

    expect(await prisma.auditLog.count()).toBe(auditBefore);
    expect(await prisma.user.findUnique({ where: { id: targetId } })).toEqual(userBefore);
  });
});