import { Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import { promoteAdminBodySchema, revokeAdminBodySchema } from "./admin.users-role.schema";
import { promoteAdmin } from "./admin.users-role.service";
import { createUpdateKit } from "./admin.users-update.db-fixture";

describe("Schema đổi vai trò admin", () => {
  it("promote chỉ chấp nhận không có body", () => {
    expect(promoteAdminBodySchema.safeParse(undefined).success).toBe(true);
    expect(promoteAdminBodySchema.safeParse({}).success).toBe(false);
    expect(promoteAdminBodySchema.safeParse({ role: Role.ADMIN }).success).toBe(false);
  });

  it("revoke chỉ chấp nhận một trường role là TEACHER hoặc STUDENT", () => {
    expect(revokeAdminBodySchema.safeParse({ role: Role.TEACHER }).success).toBe(true);
    expect(revokeAdminBodySchema.safeParse({ role: Role.STUDENT }).success).toBe(true);
    expect(revokeAdminBodySchema.safeParse(undefined).success).toBe(false);
    expect(revokeAdminBodySchema.safeParse({}).success).toBe(false);
    expect(revokeAdminBodySchema.safeParse({ role: Role.ADMIN }).success).toBe(false);
    expect(revokeAdminBodySchema.safeParse({ role: "OTHER" }).success).toBe(false);
    expect(revokeAdminBodySchema.safeParse({ role: Role.TEACHER, status: "ACTIVE" }).success).toBe(false);
  });
});

describe("promoteAdmin", () => {
  const kit = createUpdateKit();
  let adminId: number;
  let classId: number | undefined;

  const auditsFor = (id: number) =>
    prisma.auditLog.findMany({
      where: { action: "user.promote_admin", detail: { path: ["target_user_id"], equals: id } },
      select: { userId: true, detail: true },
    });

  beforeAll(async () => {
    const admin = await kit.makeUser("promote-actor", { role: Role.ADMIN });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (classId !== undefined) {
      await prisma.class.deleteMany({ where: { id: classId } });
    }
    await kit.cleanup(adminId === undefined ? [] : [adminId]);
  });

  it.each([Role.STUDENT, Role.TEACHER])("bổ nhiệm %s ACTIVE, chỉ đổi role và ghi audit", async (role) => {
    const target = await kit.makeUser("promote-target", { role });
    const before = await kit.snapshot(target.id);
    const ownedClass = role === Role.TEACHER
      ? await prisma.class.create({
          data: { teacherId: target.id, name: "Lớp thử T29", code: kit.suffix.slice(0, 6).toUpperCase() },
        })
      : undefined;
    if (ownedClass) classId = ownedClass.id;

    const result = await promoteAdmin(adminId, target.id);

    expect(result).toEqual({ ...target, role: Role.ADMIN, createdAt: before.createdAt });
    expect(await kit.snapshot(target.id)).toEqual({ ...before, role: Role.ADMIN });
    expect(await auditsFor(target.id)).toEqual([
      { userId: adminId, detail: { target_user_id: target.id, from: role, to: Role.ADMIN } },
    ]);
    if (ownedClass) {
      expect(await prisma.class.findUnique({ where: { id: ownedClass.id } })).toEqual(ownedClass);
    }
  });

  it.each([
    { role: Role.ADMIN, status: UserStatus.LOCKED, code: "USER_ALREADY_ADMIN", message: "Tài khoản đã là quản trị viên" },
    { role: Role.TEACHER, status: UserStatus.PENDING, code: "INVALID_STATUS", message: "Tài khoản đang chờ duyệt" },
    { role: Role.STUDENT, status: UserStatus.LOCKED, code: "INVALID_STATUS", message: "Tài khoản đang bị khóa" },
  ])("trả 409 cho đích $role $status và không ghi audit", async ({ role, status, code, message }) => {
    const target = await kit.makeUser("promote-conflict", { role, status });
    const before = await kit.snapshot(target.id);

    await expect(promoteAdmin(adminId, target.id)).rejects.toMatchObject({ statusCode: 409, code, message });
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await auditsFor(target.id)).toEqual([]);
  });

  it("trả 404 giống các endpoint admin khác khi không có ID", async () => {
    const id = 2_147_483_647;

    await expect(promoteAdmin(adminId, id)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
      message: "Không tìm thấy tài khoản",
    });
    expect(await auditsFor(id)).toEqual([]);
  });

  it.each([
    { role: Role.STUDENT, status: UserStatus.ACTIVE },
    { role: Role.TEACHER, status: UserStatus.ACTIVE },
    { role: Role.ADMIN, status: UserStatus.LOCKED },
    { role: Role.ADMIN, status: UserStatus.PENDING },
  ])("trả 403 cho người gọi $role $status và không ghi audit", async (actor) => {
    const caller = await kit.makeUser("promote-forbidden", actor);
    const target = await kit.makeUser("promote-forbidden-target");

    await expect(promoteAdmin(caller.id, target.id)).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect((await kit.snapshot(target.id)).role).toBe(Role.STUDENT);
    expect(await auditsFor(target.id)).toEqual([]);
  });

  it("rollback thay đổi role khi ghi audit thất bại", async () => {
    const target = await kit.makeUser("promote-rollback");
    const before = await kit.snapshot(target.id);
    const auditError = new Error("Lỗi ghi audit giả lập");
    const originalTransaction = prisma.$transaction;
    const runTransaction = originalTransaction.bind(prisma);
    const transaction = vi.spyOn(prisma, "$transaction").mockImplementationOnce((run, options) =>
      runTransaction(async (tx) => {
        const audit = vi.spyOn(tx.auditLog, "create").mockRejectedValueOnce(auditError);
        try {
          return await run(tx);
        } finally {
          audit.mockRestore();
        }
      }, options)
    );

    try {
      await expect(promoteAdmin(adminId, target.id)).rejects.toBe(auditError);
    } finally {
      transaction.mockRestore();
      prisma.$transaction = originalTransaction;
    }
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await auditsFor(target.id)).toEqual([]);
  });
});