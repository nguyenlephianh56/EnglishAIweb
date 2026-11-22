import { describe, expect, it } from "vitest";
import { redactDetail } from "./admin.audit-detail";
import { listAuditLogsQuerySchema } from "./admin.audit.schema";

describe("query danh sách audit", () => {
  it("mặc định 20 mục và chuyển các query hợp lệ về kiểu dùng cho DB", () => {
    expect(listAuditLogsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listAuditLogsQuerySchema.parse({ limit: "1" })).toEqual({ limit: 1 });
    expect(listAuditLogsQuerySchema.parse({
      action: "ai_limits.update",
      user_id: "7",
      from: "2026-11-22T07:00:00+07:00",
      to: "2026-11-22T01:00:00Z",
      limit: "100",
      cursor: "48",
    })).toEqual({
      action: "ai_limits.update",
      user_id: 7,
      from: new Date("2026-11-22T00:00:00Z"),
      to: new Date("2026-11-22T01:00:00Z"),
      limit: 100,
      cursor: 48,
    });
  });

  it("cho lọc một đầu mút hoặc hai mốc biểu diễn cùng một thời điểm", () => {
    const from = "2026-11-22T07:00:00+07:00";
    const to = "2026-11-22T00:00:00Z";
    expect(listAuditLogsQuerySchema.safeParse({ from }).success).toBe(true);
    expect(listAuditLogsQuerySchema.safeParse({ to }).success).toBe(true);
    expect(listAuditLogsQuerySchema.safeParse({ from, to }).success).toBe(true);
  });

  it.each([
    { action: "approve" }, { action: "user..approve" }, { action: "user.approve.extra" },
    { action: "User.approve" }, { action: "user.approve " },
    { user_id: "0" }, { user_id: "2147483648" }, { cursor: "abc" }, { cursor: ["1", "2"] },
    { limit: "0" }, { limit: "101" }, { limit: "1.5" },
    { from: "2026-11-22" }, { to: "2026-11-22T12:00:00" }, { to: "2026-11-22T12:00:00+99:99" },
    { from: "2026-11-22T07:00:00+07:00", to: "2026-11-21T23:59:59.999Z" },
  ])("từ chối query sai %j", (query) => {
    expect(listAuditLogsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("redactDetail", () => {
  it("che khóa nhạy cảm mọi cấp và giữ nguyên dữ liệu gốc", () => {
    const detail = {
      target_user_id: 7,
      Password: "private-a",
      password_hash: "private-b",
      AUTHORIZATION: "private-c",
      from: {
        status: "PENDING",
        token: "private-d",
        changes: [{ Email: "private-e", answer: [1], CONTENT: {} }, [null, { API_KEY: "private-f", keep: 3 }]],
      },
      to: {
        status: "ACTIVE",
        SECRET: "private-g",
        JWT_SECRET: "private-h",
        GEMINI_API_KEY: "private-i",
        refreshToken: "private-j",
        "access-token": "private-k",
      },
      token_count: 20,
      comment_changed: false,
    };
    const original = structuredClone(detail);

    expect(redactDetail(detail)).toEqual({
      target_user_id: 7,
      from: { status: "PENDING", changes: [{}, [null, { keep: 3 }]] },
      to: { status: "ACTIVE" },
      token_count: 20,
      comment_changed: false,
    });
    expect(detail).toEqual(original);
  });

  it("giữ các giá trị JSON vô hướng và xử lý mảng cấp ngoài cùng", () => {
    expect(redactDetail(null)).toBeNull();
    expect(redactDetail("ghi chú")).toBe("ghi chú");
    expect(redactDetail([1, false, "văn bản", { aPiKeY: "private", key: "writing_grade" }]))
      .toEqual([1, false, "văn bản", { key: "writing_grade" }]);
  });

  it("giữ khóa JSON đặc biệt như một thuộc tính dữ liệu bình thường", () => {
    const input = JSON.parse('{"__proto__":{"passwordHash":"private","keep":1},"constructor":"value"}');
    const detail = redactDetail(input);
    expect(Object.getPrototypeOf(detail)).toBe(Object.prototype);
    expect(JSON.stringify(detail)).toBe('{"__proto__":{"keep":1},"constructor":"value"}');
  });
});