/**
 * Test đơn vị (KHÔNG cần DB, KHÔNG gọi API) cho schema query của GET /attempts, GET /attempts/:id
 * và hai middleware validateQuery / validateParams.
 */

import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import {
  listAttemptsQuerySchema,
  attemptIdParamSchema,
} from "./attempts.schema";
import { validateQuery, validateParams } from "../../middlewares/validate";

const parse = (query: unknown) => listAttemptsQuerySchema.safeParse(query);

describe("listAttemptsQuerySchema: giá trị hợp lệ", () => {
  it("không gửi gì: page=1, limit=20, các lọc để trống", () => {
    const r = parse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ page: 1, limit: 20 });
    }
  });

  it("chuỗi số được đổi thành số, mode giữ nguyên", () => {
    const r = parse({
      assignmentId: "7",
      exerciseId: "12",
      mode: "practice",
      page: "3",
      limit: "50",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({
        assignmentId: 7,
        exerciseId: 12,
        mode: "practice",
        page: 3,
        limit: 50,
      });
    }
  });

  it("mode exam được phép lọc", () => {
    expect(parse({ mode: "exam" }).success).toBe(true);
  });

  it("limit = 1 và page = 1 là biên dưới hợp lệ", () => {
    expect(parse({ limit: "1", page: "1" }).success).toBe(true);
  });

  it("query thừa (studentId, score...) bị bỏ, không lọt vào kết quả", () => {
    const r = parse({ studentId: "999", score: "10", assignmentId: "5" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ assignmentId: 5, page: 1, limit: 20 });
      expect(r.data).not.toHaveProperty("studentId");
    }
  });
});

describe("listAttemptsQuerySchema: giá trị sai -> không hợp lệ", () => {
  const bad = ["abc", "", "0", "-1", "1.5", "1e3", " 5", "5 ", "+5", "2147483648"];

  for (const value of bad) {
    it(`assignmentId = ${JSON.stringify(value)}`, () => {
      expect(parse({ assignmentId: value }).success).toBe(false);
    });
    it(`exerciseId = ${JSON.stringify(value)}`, () => {
      expect(parse({ exerciseId: value }).success).toBe(false);
    });
  }

  it("limit quá lớn (51) -> lỗi, thông báo nêu mức tối đa", () => {
    const r = parse({ limit: "51" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("50");
  });

  for (const value of ["0", "-5", "abc", "", "2.5", "1000"]) {
    it(`limit = ${JSON.stringify(value)}`, () => {
      expect(parse({ limit: value }).success).toBe(false);
    });
  }

  for (const value of ["0", "-1", "abc", "", "1.5", "100001"]) {
    it(`page = ${JSON.stringify(value)}`, () => {
      expect(parse({ page: value }).success).toBe(false);
    });
  }

  it("mode lạ -> lỗi", () => {
    expect(parse({ mode: "foo" }).success).toBe(false);
    expect(parse({ mode: "" }).success).toBe(false);
  });

  it("tham số lặp (mảng) -> lỗi, kể cả khi mảng chỉ có 1 phần tử", () => {
    expect(parse({ assignmentId: ["1", "2"] }).success).toBe(false);
    expect(parse({ page: ["1"] }).success).toBe(false);
    expect(parse({ mode: ["practice"] }).success).toBe(false);
  });

  it("gom đủ thông báo lỗi của nhiều field sai", () => {
    const r = parse({ assignmentId: "abc", limit: "99" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues).toHaveLength(2);
  });
});

describe("attemptIdParamSchema", () => {
  it('"5" -> 5', () => {
    const r = attemptIdParamSchema.safeParse({ id: "5" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.id).toBe(5);
  });

  for (const value of ["abc", "0", "-1", "1.5", "2147483648", "99999999999999"]) {
    it(`id = ${JSON.stringify(value)} -> lỗi`, () => {
      expect(attemptIdParamSchema.safeParse({ id: value }).success).toBe(false);
    });
  }
});

// Response giả: ghi lại status + body để kiểm, không cần chạy server.
const fakeRes = () => {
  const res = {
    locals: {} as Record<string, unknown>,
    statusCode: 0,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe("validateQuery / validateParams", () => {
  it("validateQuery hợp lệ: gọi next, kết quả (đã là số) nằm ở res.locals.query", () => {
    const res = fakeRes();
    const next = vi.fn();
    validateQuery(listAttemptsQuerySchema)(
      { query: { assignmentId: "4", limit: "10" } } as unknown as Request,
      res as unknown as Response,
      next
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.locals.query).toEqual({ assignmentId: 4, page: 1, limit: 10 });
  });

  it("validateQuery sai: 400 VALIDATION_ERROR, không gọi next", () => {
    const res = fakeRes();
    const next = vi.fn();
    validateQuery(listAttemptsQuerySchema)(
      { query: { limit: "500" } } as unknown as Request,
      res as unknown as Response,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validateParams hợp lệ / sai", () => {
    const ok = fakeRes();
    const next = vi.fn();
    validateParams(attemptIdParamSchema)(
      { params: { id: "9" } } as unknown as Request,
      ok as unknown as Response,
      next
    );
    expect(next).toHaveBeenCalledOnce();
    expect(ok.locals.params).toEqual({ id: 9 });

    const bad = fakeRes();
    const next2 = vi.fn();
    validateParams(attemptIdParamSchema)(
      { params: { id: "abc" } } as unknown as Request,
      bad as unknown as Response,
      next2
    );
    expect(next2).not.toHaveBeenCalled();
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
  });
});