import { Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { createAuthorizationFixtures } from "../../testing/authorization-fixtures";
import { createUpdateKit } from "./admin.users-update.db-fixture";
import { updateUserBodySchema } from "./admin.users-update.schema";
import { updateUser } from "./admin.users-update.service";

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
let fixtures: Fixtures;
let admin: { id: number; role: Role };
const kit = createUpdateKit();
const missingUserId = 2_147_483_647;

// Chạy body qua schema như route thật (trim, chữ thường) rồi mới gọi service
const body = (value: unknown) => updateUserBodySchema.parse(value);

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test T29.");
  }
  fixtures = await createAuthorizationFixtures();
  admin = { id: fixtures.actors.admin.id, role: fixtures.actors.admin.role };
});

afterAll(async () => {
  if (!fixtures) return;
  await kit.cleanup([fixtures.actors.admin.id]);
  await fixtures.cleanup();
});

describe("updateUser: đổi thành công", () => {
  it("đổi name: chỉ name đổi, audit đúng 1 dòng chỉ có id + tên field", async () => {
    const user = await kit.makeUser("rename", { name: "Ten Cu Secret" });
    const before = await kit.snapshot(user.id);

    const result = await updateUser(admin, user.id, body({ name: "Ten Moi Secret" }));

    expect(result).toMatchObject({ id: user.id, name: "Ten Moi Secret", email: user.email });
    const after = await kit.snapshot(user.id);
    expect({ role: after.role, status: after.status, hash: after.passwordHash, email: after.email }).toEqual({
      role: before.role,
      status: before.status,
      hash: before.passwordHash,
      email: before.email,
    });

    const audits = await kit.updateAudits(user.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].userId).toBe(admin.id);
    expect(audits[0].detail).toEqual({ target_user_id: user.id, changed_fields: ["name"] });
    const text = JSON.stringify(audits[0].detail);
    expect(text).not.toContain("Ten Cu Secret");
    expect(text).not.toContain("Ten Moi Secret");
  });

  it("đổi email: lưu chữ thường đã trim, audit không chứa email cũ/mới", async () => {
    const user = await kit.makeUser("mail");
    const newEmail = `T29-Moi-${kit.suffix}@Example.TEST`;

    const result = await updateUser(admin, user.id, body({ email: `  ${newEmail}  ` }));

    expect(result.email).toBe(newEmail.toLowerCase());
    expect((await kit.snapshot(user.id)).email).toBe(newEmail.toLowerCase());

    const audits = await kit.updateAudits(user.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].detail).toEqual({ target_user_id: user.id, changed_fields: ["email"] });
    const text = JSON.stringify(audits[0].detail).toLowerCase();
    expect(text).not.toContain(user.email.toLowerCase());
    expect(text).not.toContain(newEmail.toLowerCase());
  });

  it("đổi cả hai: 1 dòng audit, changed_fields có cả name và email", async () => {
    const user = await kit.makeUser("both");
    await updateUser(admin, user.id, body({ name: "Ca Hai Ten", email: kit.emailFor("both-new") }));

    const audits = await kit.updateAudits(user.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].detail).toEqual({ target_user_id: user.id, changed_fields: ["name", "email"] });
  });

  it("chỉ field thật sự đổi mới vào audit (gửi cả hai nhưng chỉ name khác)", async () => {
    const user = await kit.makeUser("partial");
    await updateUser(admin, user.id, body({ name: "Chi Ten Doi", email: user.email.toUpperCase() }));

    const audits = await kit.updateAudits(user.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].detail).toEqual({ target_user_id: user.id, changed_fields: ["name"] });
  });

  it("admin được sửa chính mình và sửa ADMIN khác (chỉ name/email)", async () => {
    const otherAdmin = await kit.makeUser("otheradmin", { role: Role.ADMIN });
    const self = await kit.makeUser("selfadmin", { role: Role.ADMIN });
    const selfActor = { id: self.id, role: Role.ADMIN };

    const mine = await updateUser(selfActor, self.id, body({ name: "Admin Tu Sua" }));
    const other = await updateUser(selfActor, otherAdmin.id, body({ name: "Admin Khac Bi Sua" }));

    expect(mine).toMatchObject({ id: self.id, name: "Admin Tu Sua", role: Role.ADMIN });
    expect(other).toMatchObject({ id: otherAdmin.id, name: "Admin Khac Bi Sua", role: Role.ADMIN });
    expect((await kit.updateAudits(self.id))[0].userId).toBe(self.id);
    await prisma.auditLog.deleteMany({ where: { userId: self.id } });
  });

  it("sửa được cả tài khoản LOCKED/PENDING mà không đổi status", async () => {
    const locked = await kit.makeUser("lockedtarget", { status: UserStatus.LOCKED });
    const result = await updateUser(admin, locked.id, body({ name: "Bi Khoa Van Sua" }));
    expect(result.status).toBe(UserStatus.LOCKED);
  });
});

describe("updateUser: không đổi gì", () => {
  it("{} -> trả user hiện tại, không update, không audit", async () => {
    const user = await kit.makeUser("empty");
    const before = await kit.snapshot(user.id);

    const result = await updateUser(admin, user.id, body({}));

    expect(result).toMatchObject({ id: user.id, name: user.name, email: user.email });
    expect(await kit.snapshot(user.id)).toEqual(before);
    expect(await kit.updateAudits(user.id)).toHaveLength(0);
  });

  it("giá trị sau chuẩn hóa bằng giá trị cũ -> không update, không audit", async () => {
    const user = await kit.makeUser("same");
    const before = await kit.snapshot(user.id);

    const result = await updateUser(
      admin,
      user.id,
      body({ name: `  ${user.name}  `, email: `  ${user.email.toUpperCase()} ` })
    );

    expect(result).toMatchObject({ name: user.name, email: user.email });
    expect(await kit.snapshot(user.id)).toEqual(before);
    expect(await kit.updateAudits(user.id)).toHaveLength(0);
  });
});

describe("updateUser: 409 email trùng", () => {
  it("trùng email user khác (kể cả khác hoa/thường): 409, không đổi dữ liệu, không audit", async () => {
    const owner = await kit.makeUser("owner");
    const user = await kit.makeUser("victim");
    const before = await kit.snapshot(user.id);

    await expect(
      updateUser(admin, user.id, body({ name: "Ten Khong Duoc Luu", email: owner.email.toUpperCase() }))
    ).rejects.toMatchObject({ statusCode: 409, code: "EMAIL_ALREADY_EXISTS" });

    // name đi cùng cũng không được lưu: transaction hủy trọn vẹn
    expect(await kit.snapshot(user.id)).toEqual(before);
    expect(await kit.updateAudits(user.id)).toHaveLength(0);
  });

  it("song song: hai request đổi hai user sang cùng một email -> đúng 1 thành công, 1 là 409, 1 dòng audit", async () => {
    for (let round = 0; round < 3; round++) {
      const a = await kit.makeUser(`racea${round}`);
      const b = await kit.makeUser(`raceb${round}`);
      const shared = kit.emailFor(`race-shared-${round}`);

      const results = await Promise.allSettled([
        updateUser(admin, a.id, body({ email: shared })),
        updateUser(admin, b.id, body({ email: shared })),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ statusCode: 409, code: "EMAIL_ALREADY_EXISTS" });

      const audits = [...(await kit.updateAudits(a.id)), ...(await kit.updateAudits(b.id))];
      expect(audits).toHaveLength(1);
      expect(await prisma.user.count({ where: { email: shared } })).toBe(1);
    }
  });
});

describe("updateUser: rollback, quyền, 404", () => {
  it("lỗi ghi audit -> user KHÔNG bị đổi (rollback)", async () => {
    const user = await kit.makeUser("rollback", { name: "Truoc Rollback" });
    const before = await kit.snapshot(user.id);

    // Admin giả không tồn tại -> audit_logs.user_id vi phạm khóa ngoại -> việc ghi audit lỗi thật.
    const ghostAdmin = { id: missingUserId, role: Role.ADMIN };
    await expect(
      updateUser(ghostAdmin, user.id, body({ name: "Sau Rollback", email: kit.emailFor("rollback-new") }))
    ).rejects.toThrow();

    expect(await kit.snapshot(user.id)).toEqual(before);
    expect(await kit.updateAudits(user.id)).toHaveLength(0);
  });

  it("actor không phải ADMIN -> 403 (service kiểm lại quyền), không đổi gì", async () => {
    const user = await kit.makeUser("noadmin");
    const before = await kit.snapshot(user.id);

    for (const role of [Role.STUDENT, Role.TEACHER]) {
      await expect(
        updateUser({ id: admin.id, role }, user.id, body({ name: "Khong Duoc Phep" }))
      ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    }
    expect(await kit.snapshot(user.id)).toEqual(before);
    expect(await kit.updateAudits(user.id)).toHaveLength(0);
  });

  it("id không tồn tại -> 404 USER_NOT_FOUND, không audit", async () => {
    await expect(updateUser(admin, missingUserId, body({ name: "Khong Ton Tai" }))).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
    expect(await kit.updateAudits(missingUserId)).toHaveLength(0);
  });
});