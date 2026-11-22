import { describe, expect, it } from "vitest";
import { canTransitionReportStatus } from "./reports.rules";
import {
  createReportBodySchema,
  listReportsQuerySchema,
  reportIdParamSchema,
  updateReportBodySchema,
} from "./reports.schema";

const validBody = { exercise_id: 12, reason: "Đáp án câu 1 bị sai" };

describe("body tạo báo lỗi", () => {
  it("bỏ ký tự điều khiển và khoảng trắng hai đầu, giữ câu chữ", () => {
    expect(createReportBodySchema.parse({
      ...validBody,
      reason: " \u0000Đáp án  < 5\u001B\u007F\u0085 ",
    })).toEqual({ exercise_id: 12, reason: "Đáp án  < 5" });
  });

  it("nhận 1.000 ký tự Unicode sau chuẩn hóa và từ chối 1.001 ký tự", () => {
    const reason = "🙂".repeat(1000);
    expect(createReportBodySchema.parse({ ...validBody, reason: ` ${reason}\u0000 ` }).reason).toBe(reason);
    expect(createReportBodySchema.safeParse({ ...validBody, reason: `${reason}a` }).success).toBe(false);
  });

  it.each(["", "  ", " \t\u0000\r\n ", null, 12])("từ chối reason = %j", (reason) => {
    expect(createReportBodySchema.safeParse({ ...validBody, reason }).success).toBe(false);
  });

  it.each(["12", 0, -1, 1.5, 2_147_483_648])("từ chối exercise_id = %j", (exercise_id) => {
    expect(createReportBodySchema.safeParse({ ...validBody, exercise_id }).success).toBe(false);
  });

  it.each([{ reporter_id: 7 }, { status: "OPEN" }, { extra: true }])("từ chối trường ngoài hợp đồng %j", (extra) => {
    expect(createReportBodySchema.safeParse({ ...validBody, ...extra }).success).toBe(false);
  });
});

describe("query danh sách báo lỗi và tham số id", () => {
  it("mặc định 20 mục và đọc bộ lọc, limit, cursor từ URL", () => {
    expect(listReportsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listReportsQuerySchema.parse({ limit: "1" })).toEqual({ limit: 1 });
    expect(listReportsQuerySchema.parse({
      status: "IN_PROGRESS", exercise_id: "12", limit: "50", cursor: "23",
    })).toEqual({ status: "IN_PROGRESS", exercise_id: 12, limit: 50, cursor: 23 });
  });

  it.each([
    { limit: "0" }, { limit: "51" }, { limit: "1.5" }, { limit: ["1", "2"] },
    { status: "open" }, { exercise_id: "0" }, { exercise_id: "2147483648" }, { cursor: "abc" },
  ])("từ chối query %j", (query) => {
    expect(listReportsQuerySchema.safeParse(query).success).toBe(false);
  });

  it("chỉ nhận id hợp lệ từ URL", () => {
    expect(reportIdParamSchema.parse({ id: "42" })).toEqual({ id: 42 });
    for (const id of ["0", "-1", "1.5", "abc", "2147483648"]) {
      expect(reportIdParamSchema.safeParse({ id }).success).toBe(false);
    }
  });
});

describe("body cập nhật và chuyển trạng thái", () => {
  it.each(["IN_PROGRESS", "RESOLVED"])("nhận status %s", (status) => {
    expect(updateReportBodySchema.parse({ status })).toEqual({ status });
  });

  it.each([{}, { status: "OPEN" }, { status: "resolved" }, { status: "RESOLVED", reason: "sửa" }])(
    "từ chối body cập nhật %j",
    (body) => {
      expect(updateReportBodySchema.safeParse(body).success).toBe(false);
    }
  );

  it.each([
    ["OPEN", "IN_PROGRESS", true],
    ["OPEN", "RESOLVED", true],
    ["IN_PROGRESS", "RESOLVED", true],
    ["IN_PROGRESS", "IN_PROGRESS", false],
    ["RESOLVED", "IN_PROGRESS", false],
    ["RESOLVED", "RESOLVED", false],
    ["UNKNOWN", "RESOLVED", false],
  ] as const)("%s → %s, hợp lệ = %s", (from, to, valid) => {
    expect(canTransitionReportStatus(from, to)).toBe(valid);
  });
});