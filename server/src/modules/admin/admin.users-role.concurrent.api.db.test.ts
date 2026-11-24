import { Prisma, Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, startAuthorizationApp } from "../../testing/authorization-fixtures";
import { createUpdateKit } from "./admin.users-update.db-fixture";

type TestApp = Awaited<ReturnType<typeof startAuthorizationApp>>;
type HttpResponse = Awaited<ReturnType<TestApp["request"]>>;

const kit = createUpdateKit();
const adminIds: number[] = [];
let app: TestApp;

beforeAll(async () => {
  app = await startAuthorizationApp([kit.password]);
});

afterAll(async () => {
  await app?.close();
  await kit.cleanup(adminIds);
});

async function makeAdmin(label: string) {
  const admin = await kit.makeUser(label, { role: Role.ADMIN });
  adminIds.push(admin.id);
  return admin;
}

const patchRole = (action: "promote-admin" | "revoke-admin", actor: { id: number }, targetId: number) =>
  app.request(`/admin/users/${targetId}/${action}`, {
    method: "PATCH",
    headers: { ...authorizationHeaders(actor), "Content-Type": "application/json" },
    body: action === "revoke-admin" ? JSON.stringify({ role: Role.STUDENT }) : undefined,
  });

async function sendWhileUsersAreLocked(
  ids: number[],
  send: () => [Promise<HttpResponse>, Promise<HttpResponse>]
) {
  const { pending } = await prisma.$transaction(async (tx) => {
    // Chặn câu UPDATE của request lấy được khóa tư vấn trước, cho request kia kịp chờ khóa.
    await tx.$queryRaw`SELECT id FROM users WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR NO KEY UPDATE`;
    const pending = Promise.all(send());
    void pending.catch(() => undefined);

    await vi.waitFor(async () => {
      const [result] = await tx.$queryRaw<[{ waiting: boolean }]>`
        SELECT EXISTS (
          SELECT 1
          FROM pg_locks AS waiter
          CROSS JOIN LATERAL unnest(pg_blocking_pids(waiter.pid)) AS blocker(pid)
          WHERE waiter.locktype = 'advisory'
            AND NOT waiter.granted
            AND pg_backend_pid() = ANY(pg_blocking_pids(blocker.pid))
        ) AS waiting
      `;
      expect(result.waiting).toBe(true);
    }, { timeout: 3_000 });

    // Trả promise bên trong object để nhả khóa dòng rồi mới đợi HTTP hoàn tất.
    return { pending };
  }, { timeout: 8_000 });

  return pending;
}

describe("Hai request đổi vai trò admin song song", () => {
  it("hai admin thu hồi lẫn nhau, một người thành công và vẫn còn đúng một ADMIN ACTIVE", async () => {
    const a = await makeAdmin("concurrent-revoke-a");
    const b = await makeAdmin("concurrent-revoke-b");
    const ids = [a.id, b.id];

    const [fromA, fromB] = await sendWhileUsersAreLocked(ids, () => [
      patchRole("revoke-admin", a, b.id),
      patchRole("revoke-admin", b, a.id),
    ]);

    expect([fromA.status, fromB.status].sort()).toEqual([200, 403]);
    const [winner, revoked, rejected] = fromA.status === 200 ? [a, b, fromB] as const : [b, a, fromA] as const;
    expect(rejected.body).toMatchObject({ data: null, error: { code: "FORBIDDEN" } });

    const activeAdmins = await prisma.user.findMany({
      where: { id: { in: ids }, role: Role.ADMIN, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    expect(activeAdmins).toEqual([{ id: winner.id }]);
    expect(await kit.snapshot(revoked.id)).toMatchObject({ role: Role.STUDENT, status: UserStatus.ACTIVE });

    const audits = await prisma.auditLog.findMany({
      where: { action: "user.revoke_admin", userId: { in: ids } },
      select: { userId: true, detail: true },
    });
    expect(audits).toEqual([
      { userId: winner.id, detail: { target_user_id: revoked.id, from: Role.ADMIN, to: Role.STUDENT } },
    ]);
  }, 10_000);

  it("hai request bổ nhiệm cùng một user, một thành công, một 409 và đúng một audit", async () => {
    const admin = await makeAdmin("concurrent-promote-admin");
    const target = await kit.makeUser("concurrent-promote-target");

    const [first, second] = await sendWhileUsersAreLocked([target.id], () => [
      patchRole("promote-admin", admin, target.id),
      patchRole("promote-admin", admin, target.id),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const rejected = first.status === 409 ? first : second;
    expect(rejected.body).toMatchObject({ data: null, error: { code: "USER_ALREADY_ADMIN" } });
    expect(await kit.snapshot(target.id)).toMatchObject({ role: Role.ADMIN, status: UserStatus.ACTIVE });

    const audits = await prisma.auditLog.findMany({
      where: { action: "user.promote_admin", userId: admin.id },
      select: { userId: true, detail: true },
    });
    expect(audits).toEqual([
      { userId: admin.id, detail: { target_user_id: target.id, from: Role.STUDENT, to: Role.ADMIN } },
    ]);
  }, 10_000);
});