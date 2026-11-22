import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { createAuthorizationFixtures } from "../../testing/authorization-fixtures";
import { listAuditLogs } from "./admin.audit.service";
import { approveTeacher, lockUser, unlockUser } from "./admin.service";

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
let fixtures: Fixtures;
const seededAuditIds: number[] = [];
const missingUserId = 2_147_483_647;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test audit.");
  }
  fixtures = await createAuthorizationFixtures();
});

afterAll(async () => {
  if (!fixtures) return;
  await prisma.auditLog.deleteMany({
    where: { OR: [{ id: { in: seededAuditIds } }, { userId: fixtures.actors.admin.id }] },
  });
  await fixtures.cleanup();
});

async function seedAudit(userId: number, action: string, createdAt: Date, detail?: Prisma.InputJsonValue) {
  const row = await prisma.auditLog.create({
    data: { userId, action, createdAt, detail },
    select: { id: true },
  });
  seededAuditIds.push(row.id);
  return row;
}

function auditForTarget(targetId: number) {
  return prisma.auditLog.findMany({
    where: { detail: { path: ["target_user_id"], equals: targetId } },
    select: { userId: true, action: true, detail: true },
  });
}

describe("danh sách audit trên PostgreSQL", () => {
  it("lọc đúng action, actor, hai mốc thời gian và phân trang theo id giảm dần", async () => {
    const { teacherA, teacherB } = fixtures.actors;
    const action = `t26_${randomUUID().replaceAll("-", "")}.update`;
    const from = new Date("2026-11-22T08:00:00.000Z");
    const to = new Date("2026-11-22T10:00:00.000Z");
    const inside = new Date("2026-11-22T09:00:00.000Z");

    const upper = await seedAudit(teacherA.id, action, to);
    const lower = await seedAudit(teacherA.id, action, from);
    const middle = await seedAudit(teacherA.id, action, inside, {
      target_user_id: 41,
      before: { status: "PENDING", Authorization: "private-value", nested: [{ API_KEY: "private-key", keep: true }] },
      email: "private@example.test",
    });
    await seedAudit(teacherA.id, action, new Date(from.getTime() - 1));
    await seedAudit(teacherA.id, action, new Date(to.getTime() + 1));
    await seedAudit(teacherA.id, `${action}_extra`, inside);
    await seedAudit(teacherB.id, action, inside);

    const query = { action, user_id: teacherA.id, from, to, limit: 2 };
    const user = { id: teacherA.id, name: "Teacher A" };
    const first = await listAuditLogs(query);
    expect(first).toEqual({
      items: [
        {
          id: middle.id, action, user, created_at: inside,
          detail: { target_user_id: 41, before: { status: "PENDING", nested: [{ keep: true }] } },
        },
        { id: lower.id, action, user, detail: null, created_at: from },
      ],
      next_cursor: lower.id,
    });
    expect(await listAuditLogs({ ...query, cursor: first.next_cursor ?? undefined })).toEqual({
      items: [{ id: upper.id, action, user, detail: null, created_at: to }],
      next_cursor: null,
    });
  });

  it("giữ audit nhưng trả user null khi người thao tác đã bị xóa", async () => {
    const { id: userId } = fixtures.actors.studentB;
    const action = `t26_${randomUUID().replaceAll("-", "")}.change`;
    const createdAt = new Date("2026-11-22T08:00:00.000Z");
    const { id } = await seedAudit(userId, action, createdAt, { target_user_id: 42 });
    await prisma.user.delete({ where: { id: userId } });

    expect(await listAuditLogs({ action, limit: 20 })).toEqual({
      items: [{ id, action, user: null, detail: { target_user_id: 42 }, created_at: createdAt }],
      next_cursor: null,
    });
    expect(await listAuditLogs({ action, user_id: userId, limit: 20 })).toEqual({ items: [], next_cursor: null });
  });
});

const mutations = [
  { action: "user.approve", account: "pendingTeacher", from: "PENDING", to: "ACTIVE", update: approveTeacher },
  { action: "user.lock", account: "teacherA", from: "ACTIVE", to: "LOCKED", update: lockUser },
  { action: "user.unlock", account: "lockedTeacher", from: "LOCKED", to: "ACTIVE", update: unlockUser },
] as const;

describe("ghi audit khi admin đổi trạng thái tài khoản", () => {
  it.each(mutations)("$action rollback khi audit lỗi và ghi đúng một dòng khi thành công", async ({ action, account, from, to, update }) => {
    const { id: targetId } = fixtures.actors[account];
    const { id: adminId } = fixtures.actors.admin;
    const targetStatus = () => prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { status: true } });

    // Khóa ngoại audit từ chối ID người thao tác đã biến mất.
    await expect(update(targetId, missingUserId)).rejects.toMatchObject({ code: "P2003" });
    expect(await targetStatus()).toEqual({ status: from });
    expect(await auditForTarget(targetId)).toEqual([]);

    await expect(update(targetId, adminId)).resolves.toMatchObject({ id: targetId, status: to });
    expect(await targetStatus()).toEqual({ status: to });
    expect(await auditForTarget(targetId)).toEqual([{
      userId: adminId,
      action,
      detail: { target_user_id: targetId, from, to },
    }]);
  });

  it("hai lần khóa đồng thời cùng đích chỉ ghi một lần chuyển ACTIVE sang LOCKED", async () => {
    const { id: targetId } = fixtures.actors.teacherB;
    const { id: adminId } = fixtures.actors.admin;
    const results = await Promise.allSettled([lockUser(targetId, adminId), lockUser(targetId, adminId)]);

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "fulfilled", value: expect.objectContaining({ status: "LOCKED" }) }),
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ statusCode: 409, code: "INVALID_STATUS" }) }),
    ]));
    expect(await auditForTarget(targetId)).toEqual([{
      userId: adminId,
      action: "user.lock",
      detail: { target_user_id: targetId, from: "ACTIVE", to: "LOCKED" },
    }]);
  });
});