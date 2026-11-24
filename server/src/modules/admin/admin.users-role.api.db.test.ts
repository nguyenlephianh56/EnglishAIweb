import { Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, startAuthorizationApp } from "../../testing/authorization-fixtures";
import { createUpdateKit } from "./admin.users-update.db-fixture";

const kit = createUpdateKit();
const missingUserId = 2_147_483_647;
const endpoints = [
  { action: "promote-admin", body: undefined },
  { action: "revoke-admin", body: { role: Role.STUDENT } },
] as const;

type TestApp = Awaited<ReturnType<typeof startAuthorizationApp>>;
type Action = (typeof endpoints)[number]["action"];

let app: TestApp;
let admin: Awaited<ReturnType<typeof kit.makeUser>>;
let adminHeaders: ReturnType<typeof authorizationHeaders>;

const patch = (action: Action, id: number | string, body?: unknown, headers: Record<string, string> = adminHeaders) =>
  app.request(`/admin/users/${id}/${action}`, {
    method: "PATCH",
    headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const expectError = (response: Awaited<ReturnType<typeof patch>>, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({ data: null, error: { code } });
};

const countRoleAudits = (id: number) =>
  prisma.auditLog.count({
    where: {
      action: { in: ["user.promote_admin", "user.revoke_admin"] },
      detail: { path: ["target_user_id"], equals: id },
    },
  });

beforeAll(async () => {
  admin = await kit.makeUser("role-api-admin", { role: Role.ADMIN });
  adminHeaders = authorizationHeaders(admin);
  app = await startAuthorizationApp([kit.password]);
});

afterAll(async () => {
  await app?.close();
  await kit.cleanup(admin ? [admin.id] : []);
});

describe("API đổi vai trò admin", () => {
  it.each([Role.STUDENT, Role.TEACHER])("token cũ của %s dùng quyền mới ngay khi đổi role", async (role) => {
    const target = await kit.makeUser("role-api-target", { role });
    const tokenBeforePromotion = authorizationHeaders(target);
    const { createdAt } = await kit.snapshot(target.id);
    const original = { ...target, created_at: createdAt.toISOString() };

    expect((await app.request("/admin/users", { headers: tokenBeforePromotion })).status).toBe(403);

    const promoted = await patch("promote-admin", target.id);
    expect(promoted.status).toBe(200);
    expect(promoted.body).toEqual({ data: { ...original, role: Role.ADMIN } });
    expect((await app.request("/admin/users", { headers: tokenBeforePromotion })).status).toBe(200);

    const tokenWhileAdmin = authorizationHeaders(target);
    const revoked = await patch("revoke-admin", target.id, { role });
    expect(revoked.status).toBe(200);
    expect(revoked.body).toEqual({ data: original });
    expectError(await app.request("/admin/users", { headers: tokenWhileAdmin }), 403, "FORBIDDEN");
    expect(await countRoleAudits(target.id)).toBe(2);
  });

  it.each(endpoints)("$action trả 401 khi thiếu token, token hỏng hoặc hết hạn", async ({ action, body }) => {
    expectError(await patch(action, missingUserId, body, {}), 401, "UNAUTHORIZED");
    expectError(await patch(action, missingUserId, body, { Authorization: "Bearer hong.token.abc" }), 401, "INVALID_TOKEN");
    expectError(await patch(action, missingUserId, body, authorizationHeaders(admin, -1)), 401, "INVALID_TOKEN");
  });

  it.each(endpoints)("$action chỉ cho ADMIN ACTIVE", async ({ action, body }) => {
    const target = await kit.makeUser("role-api-guarded", { role: action === "promote-admin" ? Role.STUDENT : Role.ADMIN });
    const before = await kit.snapshot(target.id);
    const actors = [
      { role: Role.STUDENT, status: UserStatus.ACTIVE },
      { role: Role.TEACHER, status: UserStatus.ACTIVE },
      { role: Role.ADMIN, status: UserStatus.LOCKED },
      { role: Role.ADMIN, status: UserStatus.PENDING },
    ];

    for (const options of actors) {
      const actor = await kit.makeUser("role-api-forbidden", options);
      expectError(await patch(action, target.id, body, authorizationHeaders(actor)), 403, "FORBIDDEN");
    }
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await countRoleAudits(target.id)).toBe(0);
  });

  it.each(endpoints)("$action kiểm tra ID và dùng cùng lỗi 404 với route lock", async ({ action, body }) => {
    for (const id of ["abc", "0", "2147483648"]) {
      expectError(await patch(action, id, body), 400, "VALIDATION_ERROR");
    }
    const missing = await patch(action, missingUserId, body);
    const lock = await app.request(`/admin/users/${missingUserId}/lock`, { method: "PATCH", headers: adminHeaders });

    expectError(missing, 404, "USER_NOT_FOUND");
    expect(lock.status).toBe(404);
    expect(missing.body).toEqual(lock.body);
  });

  it("promote từ chối body JSON kể cả {} và body text", async () => {
    const target = await kit.makeUser("role-api-promote-body");

    for (const body of [{}, { role: Role.ADMIN }]) {
      expectError(await patch("promote-admin", target.id, body), 400, "VALIDATION_ERROR");
    }
    const text = await app.request(`/admin/users/${target.id}/promote-admin`, {
      method: "PATCH",
      headers: { ...adminHeaders, "Content-Type": "text/plain" },
      body: "role=ADMIN",
    });
    expectError(text, 400, "VALIDATION_ERROR");
    expect((await kit.snapshot(target.id)).role).toBe(Role.STUDENT);
    expect(await countRoleAudits(target.id)).toBe(0);
  });

  it("revoke từ chối body thiếu role, role sai hoặc field lạ", async () => {
    const target = await kit.makeUser("role-api-revoke-body", { role: Role.ADMIN });
    const bodies = [undefined, {}, { role: Role.ADMIN }, { role: "OTHER" }, { role: null }, { role: Role.TEACHER, status: "ACTIVE" }];

    for (const body of bodies) {
      expectError(await patch("revoke-admin", target.id, body), 400, "VALIDATION_ERROR");
    }
    expect((await kit.snapshot(target.id)).role).toBe(Role.ADMIN);
    expect(await countRoleAudits(target.id)).toBe(0);
  });

  it.each(endpoints)("$action từ chối tham số truy vấn", async ({ action, body }) => {
    const response = await app.request(`/admin/users/${missingUserId}/${action}?role=ADMIN`, {
      method: "PATCH",
      headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    expectError(response, 400, "VALIDATION_ERROR");
  });

  it("chuyển đúng lỗi 409 từ service và không ghi audit cho các yêu cầu bị từ chối", async () => {
    const target = await kit.makeUser("role-api-conflict");

    expectError(await patch("promote-admin", admin.id), 409, "USER_ALREADY_ADMIN");
    expectError(await patch("revoke-admin", admin.id, { role: Role.TEACHER }), 409, "CANNOT_REVOKE_SELF");
    expectError(await patch("revoke-admin", target.id, { role: Role.TEACHER }), 409, "USER_NOT_ADMIN");
    expect(await countRoleAudits(admin.id)).toBe(0);
    expect(await countRoleAudits(target.id)).toBe(0);
  });
});