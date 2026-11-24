import { Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import { deleteUser } from "./admin.users-delete.service";
import * as relatedData from "./admin.users-delete.related-data";
import { createUpdateKit } from "./admin.users-update.db-fixture";

const kit = createUpdateKit();
const exerciseIds: number[] = [];
let adminId: number;

beforeAll(async () => {
  const admin = await kit.makeUser("delete-admin", { role: Role.ADMIN });
  adminId = admin.id;
});

afterAll(async () => {
  await prisma.attempt.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await kit.cleanup([adminId]);
});

function deleteAudits(targetId: number) {
  return prisma.auditLog.findMany({
    where: {
      action: { in: ["user.delete", "user.anonymize"] },
      detail: { path: ["target_user_id"], equals: targetId },
    },
    select: { userId: true, action: true, detail: true },
  });
}

describe("service DELETE user trên PostgreSQL", () => {
  it.each([
    { role: Role.TEACHER, status: UserStatus.PENDING },
    { role: Role.STUDENT, status: UserStatus.ACTIVE },
  ])("xóa cứng tài khoản $role $status chưa có lịch sử", async (options) => {
    const target = await kit.makeUser("delete-empty", options);
    expect(await deleteUser(adminId, target.id)).toEqual({ id: target.id, mode: "deleted" });
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await deleteAudits(target.id)).toEqual([
      { userId: adminId, action: "user.delete", detail: { target_user_id: target.id, role: target.role } },
    ]);

    const replacement = await kit.makeUser("delete-email-reuse", { email: target.email });
    expect(replacement.email).toBe(target.email);
    await expect(deleteUser(adminId, target.id)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
      message: "Không tìm thấy tài khoản",
    });
    expect(await deleteAudits(target.id)).toHaveLength(1);
  });

  it.each([
    { role: Role.STUDENT, status: UserStatus.ACTIVE },
    { role: Role.TEACHER, status: UserStatus.ACTIVE },
    { role: Role.ADMIN, status: UserStatus.LOCKED },
    { role: Role.ADMIN, status: UserStatus.PENDING },
  ])("từ chối người gọi $role $status trước khi kiểm tra user đích", async (options) => {
    const actor = await kit.makeUser("delete-forbidden", options);
    await expect(deleteUser(actor.id, 2_147_483_647)).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("trả 404 cho ID vắng mặt và 409 khi tự xóa hoặc nhắm vào ADMIN khác", async () => {
    const otherAdmin = await kit.makeUser("delete-other-admin", { role: Role.ADMIN });
    await expect(deleteUser(adminId, 2_147_483_647)).rejects.toMatchObject({
      statusCode: 404, code: "USER_NOT_FOUND", message: "Không tìm thấy tài khoản",
    });
    await expect(deleteUser(adminId, adminId)).rejects.toMatchObject({ statusCode: 409, code: "CANNOT_DELETE_SELF" });
    await expect(deleteUser(adminId, otherAdmin.id)).rejects.toMatchObject({
      statusCode: 409, code: "CANNOT_DELETE_ADMIN", message: "Phải thu hồi quyền admin trước khi xóa tài khoản này",
    });
    expect(await deleteAudits(adminId)).toEqual([]);
    expect(await deleteAudits(otherAdmin.id)).toEqual([]);
  });

  it("chọn nhánh ẩn danh khi có thông báo và chặn lần gọi thứ hai", async () => {
    const target = await kit.makeUser("delete-with-notification", { status: UserStatus.LOCKED });
    const notification = await prisma.notification.create({
      data: { userId: target.id, type: "system", message: "Thông báo thử xóa T29" },
    });
    expect(await deleteUser(adminId, target.id)).toEqual({ id: target.id, mode: "anonymized" });
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).toEqual(notification);
    await expect(deleteUser(adminId, target.id)).rejects.toMatchObject({
      statusCode: 409, code: "USER_ALREADY_ANONYMIZED", message: "Tài khoản đã được ẩn danh",
    });
    expect(await deleteAudits(target.id)).toEqual([
      { userId: adminId, action: "user.anonymize", detail: { target_user_id: target.id, role: target.role } },
    ]);
  });

  it("rollback xóa cứng khi ghi audit thất bại", async () => {
    const target = await kit.makeUser("delete-audit-rollback");
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
      await expect(deleteUser(adminId, target.id)).rejects.toBe(auditError);
    } finally {
      transaction.mockRestore();
      // Prisma trả method qua Proxy, nên khôi phục thêm method gốc sau khi gỡ spy.
      prisma.$transaction = originalTransaction;
    }
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await deleteAudits(target.id)).toEqual([]);
  });

  it("chuẩn hóa P2003 thành 409 và giữ nguyên user cùng bài nộp", async () => {
    const target = await kit.makeUser("delete-fk-conflict");
    const before = await kit.snapshot(target.id);
    const exercise = await prisma.exercise.create({
      data: {
        type: "fill_blank", skill: "FOUNDATION", level: "A1", topic: "Bài thử FK T29",
        content: { text: "She ___ to school." }, answer: ["goes"], source: "ADMIN", createdById: adminId,
      },
      select: { id: true },
    });
    exerciseIds.push(exercise.id);
    const attempt = await prisma.attempt.create({
      data: { studentId: target.id, exerciseId: exercise.id, answer: ["goes"] },
    });

    const check = vi.spyOn(relatedData, "hasUserRelatedData").mockResolvedValueOnce(false);
    try {
      await expect(deleteUser(adminId, target.id)).rejects.toMatchObject({
        statusCode: 409, code: "USER_FOREIGN_KEY_CONFLICT",
      });
    } finally {
      check.mockRestore();
    }
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).toEqual(attempt);
    expect(await deleteAudits(target.id)).toEqual([]);
  });

  it("rollback ẩn danh nếu email đích đã được tài khoản khác dùng", async () => {
    const target = await kit.makeUser("delete-email-conflict");
    const before = await kit.snapshot(target.id);
    await kit.makeUser("delete-email-occupied", { email: `deleted-${target.id}@deleted.invalid` });
    await prisma.notification.create({
      data: { userId: target.id, type: "system", message: "Thông báo thử email T29" },
    });

    await expect(deleteUser(adminId, target.id)).rejects.toMatchObject({ statusCode: 409, code: "EMAIL_ALREADY_EXISTS" });
    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await deleteAudits(target.id)).toEqual([]);
  });
});