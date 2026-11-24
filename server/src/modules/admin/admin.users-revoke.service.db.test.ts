import { Role, UserStatus, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import { revokeAdmin } from "./admin.users-role.service";
import { createUpdateKit } from "./admin.users-update.db-fixture";

async function withTransactionMock(
  mockQuery: (tx: Prisma.TransactionClient) => { mockRestore(): unknown },
  runTest: () => Promise<void>
) {
  const originalTransaction = prisma.$transaction;
  const runTransaction = originalTransaction.bind(prisma);
  const transaction = vi.spyOn(prisma, "$transaction").mockImplementationOnce((run, options) =>
    runTransaction(async (tx) => {
      const mock = mockQuery(tx);
      try {
        return await run(tx);
      } finally {
        mock.mockRestore();
      }
    }, options)
  );

  try {
    await runTest();
  } finally {
    transaction.mockRestore();
    prisma.$transaction = originalTransaction;
  }
}

describe("revokeAdmin", () => {
  const kit = createUpdateKit();
  let adminId: number;
  let classId: number | undefined;

  const auditsFor = (id: number) =>
    prisma.auditLog.findMany({
      where: { action: "user.revoke_admin", detail: { path: ["target_user_id"], equals: id } },
      select: { userId: true, detail: true },
    });

  beforeAll(async () => {
    const admin = await kit.makeUser("revoke-actor", { role: Role.ADMIN });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (classId !== undefined) {
      await prisma.class.deleteMany({ where: { id: classId } });
    }
    await kit.cleanup(adminId === undefined ? [] : [adminId]);
  });

  it("thu hồi ADMIN LOCKED khi người gọi là ADMIN ACTIVE duy nhất trong nhóm thử", async () => {
    const locked = await kit.makeUser("revoke-locked", { role: Role.ADMIN, status: UserStatus.LOCKED });
    const before = await kit.snapshot(locked.id);
    const activeAdmins = () => prisma.user.findMany({
      where: { id: { in: [adminId, locked.id] }, role: Role.ADMIN, status: UserStatus.ACTIVE },
      select: { id: true },
    });

    expect(await activeAdmins()).toEqual([{ id: adminId }]);
    await expect(revokeAdmin(adminId, locked.id, Role.STUDENT)).resolves.toMatchObject({
      role: Role.STUDENT,
      status: UserStatus.LOCKED,
    });
    expect(await kit.snapshot(locked.id)).toEqual({ ...before, role: Role.STUDENT });
    expect(await activeAdmins()).toEqual([{ id: adminId }]);
    await expect(revokeAdmin(adminId, adminId, Role.TEACHER)).rejects.toMatchObject({
      statusCode: 409,
      code: "CANNOT_REVOKE_SELF",
    });
    expect(await activeAdmins()).toEqual([{ id: adminId }]);
    expect(await auditsFor(adminId)).toEqual([]);
  });

  it.each([UserStatus.ACTIVE, UserStatus.PENDING])("hạ ADMIN %s không có lớp về STUDENT", async (status) => {
    const target = await kit.makeUser("revoke-student", { role: Role.ADMIN, status });
    const before = await kit.snapshot(target.id);

    expect(await revokeAdmin(adminId, target.id, Role.STUDENT)).toEqual({
      ...target, role: Role.STUDENT, createdAt: before.createdAt,
    });
    expect(await kit.snapshot(target.id)).toEqual({ ...before, role: Role.STUDENT });
    expect(await auditsFor(target.id)).toEqual([
      { userId: adminId, detail: { target_user_id: target.id, from: Role.ADMIN, to: Role.STUDENT } },
    ]);
    expect(await prisma.user.findUnique({ where: { id: adminId }, select: { role: true, status: true } }))
      .toEqual({ role: Role.ADMIN, status: UserStatus.ACTIVE });
  });

  it("chủ lớp không thể hạ về STUDENT, hạ về TEACHER vẫn giữ lớp", async () => {
    const target = await kit.makeUser("revoke-class-owner", { role: Role.ADMIN });
    const before = await kit.snapshot(target.id);
    const ownedClass = await prisma.class.create({
      data: { teacherId: target.id, name: "Lớp thử thu hồi admin", code: kit.suffix.slice(0, 6).toUpperCase() },
    });
    classId = ownedClass.id;

    await expect(revokeAdmin(adminId, target.id, Role.STUDENT)).rejects.toMatchObject({
      statusCode: 409,
      code: "USER_OWNS_CLASSES",
    });
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await auditsFor(target.id)).toEqual([]);

    expect(await revokeAdmin(adminId, target.id, Role.TEACHER)).toEqual({
      ...target, role: Role.TEACHER, createdAt: before.createdAt,
    });
    expect(await kit.snapshot(target.id)).toEqual({ ...before, role: Role.TEACHER });
    expect(await prisma.class.findUnique({ where: { id: ownedClass.id } })).toEqual(ownedClass);
    expect(await auditsFor(target.id)).toEqual([
      { userId: adminId, detail: { target_user_id: target.id, from: Role.ADMIN, to: Role.TEACHER } },
    ]);
  });

  it("trả 404 cho ID không tồn tại và 409 cho user không phải ADMIN", async () => {
    const missingId = 2_147_483_647;
    const target = await kit.makeUser("revoke-non-admin");

    await expect(revokeAdmin(adminId, missingId, Role.STUDENT)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
      message: "Không tìm thấy tài khoản",
    });
    await expect(revokeAdmin(adminId, target.id, Role.STUDENT)).rejects.toMatchObject({
      statusCode: 409,
      code: "USER_NOT_ADMIN",
    });
    expect(await auditsFor(missingId)).toEqual([]);
    expect(await auditsFor(target.id)).toEqual([]);
  });

  it.each([
    { role: Role.ADMIN, status: UserStatus.LOCKED },
    { role: Role.TEACHER, status: UserStatus.ACTIVE },
  ])("chặn người gọi $role $status trước khi xử lý đích", async (actor) => {
    const caller = await kit.makeUser("revoke-forbidden", actor);

    await expect(revokeAdmin(caller.id, adminId, Role.STUDENT)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(await auditsFor(adminId)).toEqual([]);
  });

  it("trả 409 nếu đếm được 0 ADMIN ACTIVE sau khi loại đích", async () => {
    const target = await kit.makeUser("revoke-last-active", { role: Role.ADMIN });
    const before = await kit.snapshot(target.id);

    await withTransactionMock(
      (tx) => vi.spyOn(tx.user, "count").mockResolvedValueOnce(0),
      async () => {
        await expect(revokeAdmin(adminId, target.id, Role.STUDENT)).rejects.toMatchObject({
          statusCode: 409,
          code: "LAST_ACTIVE_ADMIN",
        });
      }
    );
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await auditsFor(target.id)).toEqual([]);
  });

  it("trả 409 nếu cập nhật có điều kiện không khớp dòng nào", async () => {
    const target = await kit.makeUser("revoke-conflict", { role: Role.ADMIN });
    const before = await kit.snapshot(target.id);

    await withTransactionMock(
      (tx) => vi.spyOn(tx.user, "updateMany").mockResolvedValueOnce({ count: 0 }),
      async () => {
        await expect(revokeAdmin(adminId, target.id, Role.STUDENT)).rejects.toMatchObject({
          statusCode: 409,
          code: "USER_ROLE_CONFLICT",
        });
      }
    );
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await auditsFor(target.id)).toEqual([]);
  });

  it("rollback thay đổi role nếu ghi audit lỗi", async () => {
    const target = await kit.makeUser("revoke-rollback", { role: Role.ADMIN });
    const before = await kit.snapshot(target.id);
    const auditError = new Error("Lỗi ghi audit giả lập");

    await withTransactionMock(
      (tx) => vi.spyOn(tx.auditLog, "create").mockRejectedValueOnce(auditError),
      async () => {
        await expect(revokeAdmin(adminId, target.id, Role.STUDENT)).rejects.toBe(auditError);
      }
    );
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await auditsFor(target.id)).toEqual([]);
  });
});