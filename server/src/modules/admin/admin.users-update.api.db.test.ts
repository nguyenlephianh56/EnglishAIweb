import { Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import {
  authorizationHeaders,
  createAuthorizationFixtures,
  startAuthorizationApp,
} from "../../testing/authorization-fixtures";
import { createUpdateKit } from "./admin.users-update.db-fixture";

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type ApiBody = {
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  error: { code: string; message: string } | null;
};

let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;
let adminHeaders: ReturnType<typeof authorizationHeaders>;
const kit = createUpdateKit();
const missingUserId = 2_147_483_647;
const expectedKeys = ["createdAt", "email", "id", "name", "role", "status"];

const asBody = (response: { body: unknown }) => response.body as ApiBody;
const json = { "Content-Type": "application/json" };

const patchUser = (id: number | string, payload: unknown, headers: Record<string, string> = adminHeaders) =>
  app.request(`/admin/users/${id}`, { method: "PATCH", headers: { ...headers, ...json }, body: JSON.stringify(payload) });

const login = (email: string) =>
  app.request("/auth/login", { method: "POST", headers: json, body: JSON.stringify({ email, password: kit.password }) });

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test API T29.");
  }
  fixtures = await createAuthorizationFixtures();
  adminHeaders = authorizationHeaders(fixtures.actors.admin);
  app = await startAuthorizationApp([...fixtures.forbiddenValues, kit.password]);
});

afterAll(async () => {
  await app?.close();
  if (!fixtures) return;
  await kit.cleanup([fixtures.actors.admin.id]);
  await fixtures.cleanup();
});

describe("PATCH /admin/users/:id - phân quyền", () => {
  it("không token / token hỏng -> 401", async () => {
    const target = await kit.makeUser("auth401");
    const badHeaders: Record<string, string>[] = [{}, { Authorization: "Bearer hong.token.abc" }, { Authorization: "Basic abc" }];
    for (const headers of badHeaders) {
      const response = await patchUser(target.id, { name: "Khong Token" }, headers);
      expect(response.status).toBe(401);
      expect(asBody(response).data).toBeNull();
    }
    expect((await kit.snapshot(target.id)).name).toBe(target.name);
  });

  it("STUDENT, TEACHER, TEACHER PENDING/LOCKED -> 403, không đổi dữ liệu", async () => {
    const target = await kit.makeUser("auth403");
    const before = await kit.snapshot(target.id);
    const actors = [
      fixtures.actors.studentA,
      fixtures.actors.teacherA,
      fixtures.actors.pendingTeacher,
      fixtures.actors.lockedTeacher,
    ];

    for (const actor of actors) {
      const response = await patchUser(target.id, { name: "Khong Co Quyen" }, authorizationHeaders(actor));
      expect(response.status).toBe(403);
      expect(asBody(response).error?.code).toBe("FORBIDDEN");
    }
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await kit.updateAudits(target.id)).toHaveLength(0);
  });

  it("ADMIN bị LOCKED hoặc PENDING -> 403", async () => {
    const target = await kit.makeUser("auth403admin");
    for (const status of [UserStatus.LOCKED, UserStatus.PENDING]) {
      const badAdmin = await kit.makeUser(`badadmin-${status.toLowerCase()}`, { role: Role.ADMIN, status });
      const response = await patchUser(target.id, { name: "Admin Bi Khoa" }, authorizationHeaders(badAdmin));
      expect(response.status).toBe(403);
    }
    expect((await kit.snapshot(target.id)).name).toBe(target.name);
  });

  it("id không tồn tại -> 404, cùng mã và thông báo với endpoint admin khác (lock)", async () => {
    const patch = await patchUser(missingUserId, { name: "Khong Ton Tai" });
    const lock = await app.request(`/admin/users/${missingUserId}/lock`, { method: "PATCH", headers: adminHeaders });

    expect(patch.status).toBe(404);
    expect(lock.status).toBe(404);
    expect(asBody(patch).error).toEqual(asBody(lock).error);
  });

  it("id sai định dạng -> cùng cách với endpoint admin khác (400 VALIDATION_ERROR)", async () => {
    for (const badId of ["abc", "0", "-5", "1.5"]) {
      const patch = await patchUser(badId, { name: "Id Sai Dinh Dang" });
      const lock = await app.request(`/admin/users/${badId}/lock`, { method: "PATCH", headers: adminHeaders });
      expect(patch.status).toBe(lock.status);
      expect(patch.status).toBe(400);
      expect(asBody(patch).error).toEqual(asBody(lock).error);
    }
  });
});

describe("PATCH /admin/users/:id - body sai -> 400", () => {
  it.each([
    ["role", { role: "ADMIN" }],
    ["status", { status: "LOCKED" }],
    ["password", { password: "matkhau-moi-12345" }],
    ["passwordHash", { passwordHash: "x" }],
    ["password_hash", { password_hash: "x" }],
    ["field lạ", { foo: "bar" }],
    ["field lạ kèm name hợp lệ", { name: "Ten Hop Le", role: "ADMIN" }],
  ])("%s", async (_label, payload) => {
    const target = await kit.makeUser("strict");
    const before = await kit.snapshot(target.id);

    const response = await patchUser(target.id, payload);

    expect(response.status).toBe(400);
    expect(asBody(response).error?.code).toBe("VALIDATION_ERROR");
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await kit.updateAudits(target.id)).toHaveLength(0);
  });

  it("email sai định dạng, name rỗng/chỉ khoảng trắng, name 101 ký tự -> 400", async () => {
    const target = await kit.makeUser("invalid");
    for (const payload of [
      { email: "khong-phai-email" },
      { name: "" },
      { name: "     " },
      { name: "a".repeat(101) },
      { name: "Co\nXuong Dong" },
      [],
    ]) {
      const response = await patchUser(target.id, payload);
      expect(response.status).toBe(400);
    }
    expect((await kit.snapshot(target.id)).name).toBe(target.name);
    expect(await kit.updateAudits(target.id)).toHaveLength(0);
  });

  it("name đúng 100 ký tự -> 200", async () => {
    const target = await kit.makeUser("name100");
    const name = "a".repeat(100);
    const response = await patchUser(target.id, { name });
    expect(response.status).toBe(200);
    expect(asBody(response).data).toMatchObject({ name });
  });
});

describe("PATCH /admin/users/:id - thành công", () => {
  it("đổi name: 200, đúng các field như item của GET /admin/users, không field thừa", async () => {
    const target = await kit.makeUser("okname");
    const response = await patchUser(target.id, { name: "  Ten Moi Qua API  " });

    expect(response.status).toBe(200);
    const data = asBody(response).data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(expectedKeys);
    expect(data).toMatchObject({ id: target.id, name: "Ten Moi Qua API", email: target.email, role: target.role, status: target.status });
    expect(asBody(response).error).toBeNull();

    const list = await app.request(`/admin/users?role=${target.role}`, { headers: adminHeaders });
    const item = (asBody(list).data as Record<string, unknown>[]).find((row) => row.id === target.id);
    expect(item).toEqual(data);
  });

  it("đổi email (HOA + khoảng trắng): lưu chữ thường đã trim; đăng nhập email mới được, email cũ thì không", async () => {
    const target = await kit.makeUser("okmail");
    const newEmail = kit.emailFor("okmail-moi");

    const response = await patchUser(target.id, { email: `  ${newEmail.toUpperCase()}  ` });

    expect(response.status).toBe(200);
    expect(asBody(response).data).toMatchObject({ email: newEmail });
    expect((await login(newEmail)).status).toBe(200);
    expect((await login(newEmail.toUpperCase())).status).toBe(200);
    expect((await login(target.email)).status).toBe(401);
  });

  it("đổi cả hai: 200, đúng 1 dòng audit, user_id là admin gọi, detail không có giá trị name/email", async () => {
    const target = await kit.makeUser("okboth", { name: "Ten Cu Tuyet Mat" });
    const newEmail = kit.emailFor("okboth-moi");

    const response = await patchUser(target.id, { name: "Ten Moi Tuyet Mat", email: newEmail });
    expect(response.status).toBe(200);

    const audits = await kit.updateAudits(target.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].userId).toBe(fixtures.actors.admin.id);
    expect(audits[0].detail).toEqual({ target_user_id: target.id, changed_fields: ["name", "email"] });
    const text = JSON.stringify(audits[0].detail).toLowerCase();
    for (const secret of [target.email, newEmail, "ten cu tuyet mat", "ten moi tuyet mat"]) {
      expect(text).not.toContain(secret.toLowerCase());
    }

    // Nhật ký audit qua API cũng không lộ giá trị
    const logs = await app.request(`/admin/audit-logs?action=user.update&user_id=${fixtures.actors.admin.id}`, {
      headers: adminHeaders,
    });
    expect(JSON.stringify(logs.body).toLowerCase()).not.toContain(newEmail.toLowerCase());
  });

  it("{} và giá trị không đổi -> 200, trả user hiện tại, không audit, dữ liệu không đổi", async () => {
    const target = await kit.makeUser("okempty");
    const before = await kit.snapshot(target.id);

    for (const payload of [{}, { name: target.name }, { email: target.email.toUpperCase() }, { name: ` ${target.name} `, email: target.email }]) {
      const response = await patchUser(target.id, payload);
      expect(response.status).toBe(200);
      expect(asBody(response).data).toMatchObject({ id: target.id, name: target.name, email: target.email });
    }
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await kit.updateAudits(target.id)).toHaveLength(0);
  });

  it("role, status, mật khẩu của user đích không đổi sau khi sửa", async () => {
    const target = await kit.makeUser("okkeep", { role: Role.TEACHER, status: UserStatus.PENDING });
    const before = await kit.snapshot(target.id);

    const response = await patchUser(target.id, { name: "Giu Nguyen Quyen", email: kit.emailFor("okkeep-moi") });
    expect(response.status).toBe(200);

    const after = await kit.snapshot(target.id);
    expect(after.role).toBe(before.role);
    expect(after.status).toBe(before.status);
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("admin sửa chính mình: ok, token cũ vẫn dùng được sau khi đổi email (token chỉ chứa userId)", async () => {
    const self = await kit.makeUser("selfedit", { role: Role.ADMIN });
    const selfHeaders = authorizationHeaders(self);

    const response = await patchUser(self.id, { email: kit.emailFor("selfedit-moi") }, selfHeaders);
    expect(response.status).toBe(200);
    expect(asBody(response).data).toMatchObject({ role: Role.ADMIN, status: UserStatus.ACTIVE });

    const afterToken = await app.request("/admin/users?role=ADMIN", { headers: selfHeaders });
    expect(afterToken.status).toBe(200);
  });

  it("admin sửa ADMIN khác: ok", async () => {
    const other = await kit.makeUser("otheradm", { role: Role.ADMIN });
    const response = await patchUser(other.id, { name: "Admin Khac Doi Ten" });
    expect(response.status).toBe(200);
    expect(asBody(response).data).toMatchObject({ role: Role.ADMIN, name: "Admin Khac Doi Ten" });
  });
});

describe("PATCH /admin/users/:id - 409", () => {
  it("trùng email user khác (kể cả khác hoa/thường) -> 409 { data: null, error }, không đổi dữ liệu, không audit", async () => {
    const owner = await kit.makeUser("dupowner");
    const target = await kit.makeUser("dupvictim");
    const before = await kit.snapshot(target.id);

    for (const email of [owner.email, owner.email.toUpperCase(), ` ${owner.email} `]) {
      const response = await patchUser(target.id, { name: "Ten Khong Duoc Luu", email });
      expect(response.status).toBe(409);
      expect(asBody(response).data).toBeNull();
      expect(asBody(response).error?.code).toBe("EMAIL_ALREADY_EXISTS");
    }
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await kit.updateAudits(target.id)).toHaveLength(0);
  });

  it("song song qua API: hai user đổi sang cùng một email -> đúng 1 là 200, 1 là 409, 1 dòng audit", async () => {
    const a = await kit.makeUser("apiracea");
    const b = await kit.makeUser("apiraceb");
    const shared = kit.emailFor("api-race-shared");

    const [ra, rb] = await Promise.all([patchUser(a.id, { email: shared }), patchUser(b.id, { email: shared })]);

    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const audits = [...(await kit.updateAudits(a.id)), ...(await kit.updateAudits(b.id))];
    expect(audits).toHaveLength(1);
    expect(await prisma.user.count({ where: { email: shared } })).toBe(1);
  });
});