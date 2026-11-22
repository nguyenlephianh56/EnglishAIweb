import { randomUUID } from "node:crypto";
import type { Notification } from "@prisma/client";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma";
import { authorizationHeaders, createAuthorizationFixtures, startAuthorizationApp } from "../../testing/authorization-fixtures";

type Fixtures = Awaited<ReturnType<typeof createAuthorizationFixtures>>;
type Actor = keyof Fixtures["actors"];

let fixtures: Fixtures;
let app: Awaited<ReturnType<typeof startAuthorizationApp>>;
let firstSystem: Notification;
let deadline: Notification;
let sameTimeRead: Notification;
let legacyDeadline: Notification;
let foreign: Notification;

const newer = new Date("2026-11-21T10:00:00.000Z");
const readTime = new Date("2026-11-21T11:00:00.000Z");
const deadlineType = "deadline:321:4";
const missingId = 2_147_483_647;

function seed(actor: Actor, message: string, fields: Partial<Pick<Notification, "type" | "createdAt" | "readAt">> = {}) {
  return prisma.notification.create({
    data: { userId: fixtures.actors[actor].id, type: "system", message, createdAt: newer, ...fields },
  });
}

function item(row: Notification, type = "system", assignmentId: number | null = null) {
  return {
    id: row.id,
    type,
    message: row.message,
    read: row.readAt !== null,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    assignment_id: assignmentId,
  };
}

const ok = (data: unknown) => ({ status: 200, body: { data, error: null } });
const postJson = (data: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

function call(path: string, init?: RequestInit) {
  return app.request(`/notifications${path}`, init, { forbiddenKeys: ["user_id", "userId"] });
}

function request(path: string, actor: Actor = "studentA", init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authorizationHeaders(fixtures.actors[actor]).Authorization);
  return call(path, { ...init, headers });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL trước khi chạy test thông báo.");
  }

  fixtures = await createAuthorizationFixtures();
  firstSystem = await seed("studentA", "Thông báo hệ thống", { createdAt: new Date("2026-11-20T10:00:00.000Z") });
  deadline = await seed("studentA", "Bài giao sắp đến hạn", { type: deadlineType });
  sameTimeRead = await seed("studentA", "Thông báo cùng thời điểm", { readAt: readTime });
  legacyDeadline = await seed("studentA", "Nhắc hạn cũ", {
    type: "deadline", createdAt: new Date("2026-11-19T10:00:00.000Z"), readAt: readTime,
  });
  foreign = await seed("teacherB", "Thông báo riêng của giáo viên B", { createdAt: readTime });
  app = await startAuthorizationApp([...fixtures.forbiddenValues, deadlineType]);
});

afterAll(async () => {
  await app?.close();
  await fixtures?.cleanup();
});

describe("API thông báo", () => {
  it("sắp xếp theo created_at rồi id và phân trang đủ mục, kể cả khi trùng thời điểm", async () => {
    expect(await request(`?limit=1&user_id=${foreign.userId}`)).toEqual(ok({
      items: [item(sameTimeRead)], next_cursor: sameTimeRead.id, unread_count: 2,
    }));
    expect(await request(`?limit=2&cursor=${sameTimeRead.id}`)).toEqual(ok({
      items: [item(deadline, "deadline", 321), item(firstSystem)], next_cursor: firstSystem.id, unread_count: 2,
    }));
    expect(await request(`?limit=50&cursor=${firstSystem.id}&unread=false`)).toEqual(ok({
      items: [item(legacyDeadline, "deadline")], next_cursor: null, unread_count: 2,
    }));
  });

  it("mặc định 20 mục và chấp nhận limit=50", async () => {
    await prisma.notification.createMany({
      data: Array.from({ length: 50 }, () => ({
        userId: foreign.userId, type: "system", message: "Thông báo để thử giới hạn",
      })),
    });
    for (const [query, limit] of [["", 20], ["?limit=50", 50]] as const) {
      const reply = await request(query, "teacherB");
      expect(reply.status).toBe(200);
      const { data } = reply.body as {
        data: { items: { id: number }[]; next_cursor: number; unread_count: number };
      };
      expect(data.items).toHaveLength(limit);
      expect(data.next_cursor).toBe(data.items.at(-1)?.id);
      expect(data.unread_count).toBe(51);
    }
  });

  it("lọc chưa đọc, vẫn phân trang được qua cursor đã đọc và đếm toàn bộ mục chưa đọc", async () => {
    const unreadPage = ok({
      items: [item(deadline, "deadline", 321), item(firstSystem)], next_cursor: null, unread_count: 2,
    });
    expect(await request("?unread=true")).toEqual(unreadPage);
    expect(await request(`?unread=true&cursor=${sameTimeRead.id}`)).toEqual(unreadPage);
    expect(await request("/unread-count")).toEqual(ok({ unread_count: 2 }));
  });

  it("cursor ngoài phạm vi và cursor không tồn tại đều có cùng trang rỗng", async () => {
    const emptyPage = ok({ items: [], next_cursor: null, unread_count: 2 });
    expect(await request(`?cursor=${foreign.id}`)).toEqual(emptyPage);
    expect(await request(`?cursor=${missingId}`)).toEqual(emptyPage);
  });

  it("trả 400 cho query, id hoặc body sai", async () => {
    const validationError = {
      status: 400,
      body: { data: null, error: { code: "VALIDATION_ERROR", message: expect.any(String) } },
    };
    for (const query of [
      "?limit=0", "?limit=51", "?limit=1e1", "?limit=2.5", "?limit=1&limit=2",
      "?cursor=", "?cursor=0", "?cursor=abc", "?cursor=2147483648", "?unread=1", "?unread=TRUE",
    ]) {
      expect(await request(query), query).toEqual(validationError);
    }
    for (const id of ["0", "-1", "abc", "1.5", "1e3", "2147483648"]) {
      expect(await request(`/${id}/read`, "studentA", { method: "PATCH" }), id).toEqual(validationError);
    }
    expect(await request("/read-all", "studentA", postJson({ user_id: foreign.userId }))).toEqual(validationError);
    expect(await request("/read-all", "studentA", postJson([]))).toEqual(validationError);
    expect(await request("/unread-count")).toEqual(ok({ unread_count: 2 }));
  });

  it("đánh dấu ID của người khác hoặc ID không tồn tại đều trả cùng 404", async () => {
    const patch = { method: "PATCH" };
    const expected = {
      status: 404,
      body: { data: null, error: { code: "NOT_FOUND", message: "Không tìm thấy thông báo" } },
    };
    expect(await request(`/${foreign.id}/read`, "studentA", patch)).toEqual(expected);
    expect(await request(`/${missingId}/read`, "studentA", patch)).toEqual(expected);
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign);
  });

  it.each(["studentB", "teacherA", "admin"] as const)("%s ACTIVE dùng được cả bốn API cho dữ liệu của mình", async (actor) => {
    const old = await seed(actor, "Đã đọc từ trước", { readAt: readTime });
    const bulk = await seed(actor, "Đọc qua read-all");
    const single = await seed(actor, "Đọc từng thông báo");

    expect(await request("", actor)).toEqual(ok({
      items: [item(single), item(bulk), item(old)], next_cursor: null, unread_count: 2,
    }));
    expect(await request("/unread-count", actor)).toEqual(ok({ unread_count: 2 }));

    const patch = { method: "PATCH" };
    const readSingle = () => request(`/${single.id}/read`, actor, patch);
    const [first, concurrent] = await Promise.all([readSingle(), readSingle()]);
    expect(first).toEqual(ok({ ...item(single), read: true, read_at: expect.any(String) }));
    expect(concurrent).toEqual(first);
    expect(await readSingle()).toEqual(first);
    expect(await request(`/${old.id}/read`, actor, patch)).toEqual(ok(item(old)));

    expect(await request("/read-all", actor, { method: "POST" })).toEqual(ok({ updated: 1 }));
    expect(await request("/read-all", actor, postJson({}))).toEqual(ok({ updated: 0 }));
    expect(await request("/unread-count", actor)).toEqual(ok({ unread_count: 0 }));
    expect(await readSingle()).toEqual(first);
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old);
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign);
  });

  it("chặn thiếu token, token lỗi, tài khoản đã xóa, PENDING và LOCKED trên cả bốn API", async () => {
    const removed = await prisma.user.create({
      data: { name: "T25", email: `t25-${randomUUID()}@example.test`, passwordHash: "t25-test-fixture" },
      select: { id: true },
    });
    const deletedAccountHeaders = authorizationHeaders(removed);
    await prisma.user.delete({ where: { id: removed.id } });

    const { studentA, pendingTeacher, lockedTeacher } = fixtures.actors;
    const wrongSignature = jwt.sign({ userId: studentA.id }, "t25-different-signing-key");
    const cases = [
      [undefined, 401, "UNAUTHORIZED"],
      [{ Authorization: "Bearer invalid-token" }, 401, "INVALID_TOKEN"],
      [{ Authorization: `Bearer ${wrongSignature}` }, 401, "INVALID_TOKEN"],
      [authorizationHeaders(studentA, -60), 401, "INVALID_TOKEN"],
      [deletedAccountHeaders, 401, "UNAUTHORIZED"],
      [authorizationHeaders(pendingTeacher), 403, "FORBIDDEN"],
      [authorizationHeaders(lockedTeacher), 403, "FORBIDDEN"],
    ] as const;

    for (const [headers, status, code] of cases) {
      for (const [path, method] of [
        ["", "GET"], ["/unread-count", "GET"], [`/${deadline.id}/read`, "PATCH"], ["/read-all", "POST"],
      ]) {
        expect(await call(path, { method, headers }), `${method} ${path}`).toEqual({
          status,
          body: { data: null, error: { code, message: expect.any(String) } },
        });
      }
    }
  });
});