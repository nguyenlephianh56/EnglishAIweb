import express from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { analysisRoutes } from "./analysis.routes";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  class: { findFirst: vi.fn() },
  skillProfile: { findMany: vi.fn() },
  attempt: { findMany: vi.fn() },
  aiUsageLog: { create: vi.fn() },
}));
vi.mock("../../config/prisma", () => ({ prisma: db }));
vi.mock("../../config/env", () => ({ env: { JWT_SECRET: "analysis-test-key" } }));

const testKey = "analysis-test-key";
const teacher = { id: 1, role: "TEACHER", status: "ACTIVE" };
const admin = { id: 2, role: "ADMIN", status: "ACTIVE" };
const accounts = new Map([
  [teacher.id, teacher],
  [admin.id, admin],
  [3, { id: 3, role: "STUDENT", status: "ACTIVE" }],
  [4, { id: 4, role: "TEACHER", status: "PENDING" }],
  [5, { id: 5, role: "TEACHER", status: "LOCKED" }],
]);
const scoredRow = { skill: "READING", score: 0, level: null, errorStats: { vocab: 2 } };

let server: Server;
let baseUrl: string;

function sign(userId: number, key = testKey, expiresIn = 60) {
  return jwt.sign({ userId }, key, { expiresIn });
}

async function post(path: string, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  const app = express();
  app.use("/api/v1/analysis", analysisRoutes);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}/api/v1/analysis`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findUnique.mockImplementation(({ where }) => accounts.get(where.id) ?? null);
});

afterEach(() => {
  expect(db.attempt.findMany).not.toHaveBeenCalled();
  expect(db.aiUsageLog.create).not.toHaveBeenCalled();
});

describe("POST analysis", () => {
  it.each([
    ["thiếu token", undefined],
    ["token hết hạn", sign(teacher.id, testKey, -60)],
    ["token sai chữ ký", sign(teacher.id, "wrong-key")],
    ["tài khoản đã bị xóa", sign(99)],
  ])("trả 401 trước kiểm tra ID khi %s", async (_label, token) => {
    const result = await post("/students/khong-hop-le", token);
    expect(result.status).toBe(401);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it.each([3, 4, 5])("trả 403 trước tra cứu phạm vi cho tài khoản %i", async (userId) => {
    const result = await post("/classes/khong-hop-le", sign(userId));
    expect(result.status).toBe(403);
    expect(db.class.findFirst).not.toHaveBeenCalled();
  });

  it.each(["/students/1.5", "/classes/0", "/classes/2147483648"])("trả 400 cho %s", async (path) => {
    const result = await post(path, sign(teacher.id));
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.class.findFirst).not.toHaveBeenCalled();
  });

  it("GV xem được HS lớp mình, chỉ lấy id/tên và hồ sơ đã lưu", async () => {
    db.user.findFirst.mockResolvedValue({ id: 3, name: "Học sinh" });
    db.skillProfile.findMany.mockResolvedValue([scoredRow]);

    const result = await post("/students/3", sign(teacher.id));

    expect(result.status).toBe(200);
    expect(result.body.data.target).toEqual({ id: 3, name: "Học sinh" });
    expect(result.body.data.stats.skills.READING).toEqual({ score: 0, level: null });
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { id: 3, role: "STUDENT", memberships: { some: { class: { teacherId: teacher.id } } } },
      select: { id: true, name: true },
    });
    expect(db.skillProfile.findMany).toHaveBeenCalledTimes(1);
  });

  it("HS ngoài phạm vi, không tồn tại hoặc sai vai trò nhận cùng 404", async () => {
    db.user.findFirst.mockResolvedValue(null);
    const token = sign(teacher.id);
    const outside = await post("/students/20", token);
    expect(await post("/students/99", token)).toEqual(outside);
    expect(await post("/students/2", token)).toEqual(outside);
    expect(outside).toEqual({
      status: 404,
      body: { data: null, error: { code: "STUDENT_NOT_FOUND", message: "Không tìm thấy học sinh" } },
    });
    expect(db.skillProfile.findMany).not.toHaveBeenCalled();
  });

  it("GV đọc hồ sơ lớp mình bằng một truy vấn có lọc thành viên STUDENT ACTIVE", async () => {
    db.class.findFirst.mockResolvedValue({ id: 10, name: "Lớp A" });
    db.skillProfile.findMany.mockResolvedValue([scoredRow]);

    const result = await post("/classes/10", sign(teacher.id));

    expect(result.status).toBe(200);
    const where = { id: 10, teacherId: teacher.id };
    expect(db.class.findFirst).toHaveBeenCalledWith({ where, select: { id: true, name: true } });
    expect(db.skillProfile.findMany).toHaveBeenCalledTimes(1);
    expect(db.skillProfile.findMany).toHaveBeenCalledWith({
      where: { student: { role: "STUDENT", status: "ACTIVE", memberships: { some: { class: where } } } },
      select: { skill: true, score: true, level: true, errorStats: true },
    });
  });

  it("lớp của GV khác và lớp không tồn tại nhận cùng 404 trước khi đọc hồ sơ", async () => {
    db.class.findFirst.mockResolvedValue(null);
    const token = sign(teacher.id);
    const outside = await post("/classes/20", token);
    expect(await post("/classes/99", token)).toEqual(outside);
    expect(outside).toEqual({
      status: 404,
      body: { data: null, error: { code: "CLASS_NOT_FOUND", message: "Không tìm thấy lớp" } },
    });
    expect(db.skillProfile.findMany).not.toHaveBeenCalled();
  });

  it("ADMIN xem được HS và lớp trên toàn bộ hệ thống", async () => {
    db.user.findFirst.mockResolvedValue({ id: 3, name: "Học sinh" });
    db.class.findFirst.mockResolvedValue({ id: 10, name: "Lớp A" });
    db.skillProfile.findMany.mockResolvedValue([scoredRow]);

    const token = sign(admin.id);
    expect((await post("/students/3", token)).status).toBe(200);
    expect((await post("/classes/10", token)).status).toBe(200);
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { id: 3, role: "STUDENT" }, select: { id: true, name: true },
    });
    expect(db.class.findFirst).toHaveBeenCalledWith({
      where: { id: 10 }, select: { id: true, name: true },
    });
  });

  it("trả 422 cho HS không có điểm và lớp được phép xem không có hồ sơ", async () => {
    db.user.findFirst.mockResolvedValue({ id: 3, name: "Học sinh" });
    db.class.findFirst.mockResolvedValue({ id: 10, name: "Lớp A" });
    db.skillProfile.findMany.mockResolvedValueOnce([{ ...scoredRow, score: null }]).mockResolvedValue([]);
    const token = sign(teacher.id);
    const student = await post("/students/3", token);
    expect(await post("/classes/10", token)).toEqual(student);
    expect(student).toEqual({
      status: 422,
      body: { data: null, error: { code: "NOT_ENOUGH_DATA", message: "Chưa đủ dữ liệu để phân tích" } },
    });
  });
});