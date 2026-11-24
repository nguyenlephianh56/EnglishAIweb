import { Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import { createUpdateKit } from "./admin.users-update.db-fixture";
import { anonymizeUserWithAudit, createAnonymizedPasswordHash } from "./admin.users-delete.anonymize";

const kit = createUpdateKit();
const adminIds: number[] = [];
const exerciseIds: number[] = [];

afterAll(async () => {
  await prisma.attempt.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await kit.cleanup(adminIds);
});

function anonymizeAudits(targetId: number) {
  return prisma.auditLog.findMany({
    where: { action: "user.anonymize", detail: { path: ["target_user_id"], equals: targetId } },
    select: { userId: true, action: true, detail: true },
  });
}

describe("ẩn danh tài khoản và ghi audit trên PostgreSQL", () => {
  it("khóa tài khoản, giữ bài nộp, giải phóng email cũ và ghi audit tối thiểu", async () => {
    const admin = await kit.makeUser("anonymize-admin", { role: Role.ADMIN });
    adminIds.push(admin.id);
    const target = await kit.makeUser("anonymize-student");
    const before = await kit.snapshot(target.id);
    const exercise = await prisma.exercise.create({
      data: {
        type: "fill_blank",
        skill: "FOUNDATION",
        level: "A1",
        topic: "Bài thử ẩn danh T29",
        content: { text: "She ___ to school." },
        answer: ["goes"],
        source: "ADMIN",
        createdById: admin.id,
      },
      select: { id: true },
    });
    exerciseIds.push(exercise.id);
    const attempt = await prisma.attempt.create({
      data: { studentId: target.id, exerciseId: exercise.id, answer: ["goes"] },
    });

    const passwordHash = await createAnonymizedPasswordHash();
    const result = await prisma.$transaction((tx) => anonymizeUserWithAudit(tx, admin.id, target, passwordHash));

    const after = await kit.snapshot(target.id);
    expect(result).toEqual({ id: target.id, mode: "anonymized" });
    expect(after).toMatchObject({
      id: before.id,
      name: "Người dùng đã xóa",
      email: `deleted-${before.id}@deleted.invalid`,
      role: before.role,
      status: UserStatus.LOCKED,
    });
    expect(after.passwordHash).toBe(passwordHash);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(bcrypt.getRounds(after.passwordHash)).toBe(10);
    expect(await bcrypt.compare(kit.password, after.passwordHash)).toBe(false);
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).toEqual(attempt);

    const newUser = await kit.makeUser("anonymize-email-reuse", { email: target.email });
    expect(newUser.email).toBe(target.email);
    expect(newUser.id).not.toBe(target.id);
    expect(await anonymizeAudits(target.id)).toEqual([
      {
        userId: admin.id,
        action: "user.anonymize",
        detail: { target_user_id: target.id, role: target.role },
      },
    ]);
  });

  it("rollback toàn bộ thay đổi của user khi bước ghi audit lỗi", async () => {
    const admin = await kit.makeUser("anonymize-rollback-admin", { role: Role.ADMIN });
    adminIds.push(admin.id);
    const target = await kit.makeUser("anonymize-rollback");
    const before = await kit.snapshot(target.id);
    const passwordHash = await createAnonymizedPasswordHash();
    const auditError = new Error("Lỗi ghi audit giả lập");

    await expect(
      prisma.$transaction(async (tx) => {
        const audit = vi.spyOn(tx.auditLog, "create").mockRejectedValueOnce(auditError);
        try {
          return await anonymizeUserWithAudit(tx, admin.id, target, passwordHash);
        } finally {
          audit.mockRestore();
        }
      })
    ).rejects.toBe(auditError);

    expect(await kit.snapshot(target.id)).toEqual(before);
    expect(await anonymizeAudits(target.id)).toEqual([]);
  });
});