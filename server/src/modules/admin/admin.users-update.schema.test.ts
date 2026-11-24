import { describe, expect, it } from "vitest";
import { updateUserBodySchema } from "./admin.users-update.schema";

const parse = (value: unknown) => updateUserBodySchema.safeParse(value);
const messages = (value: unknown) => {
  const result = parse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("updateUserBodySchema (T29 - Sửa)", () => {
  it("chấp nhận {} (không đổi gì)", () => {
    expect(parse({})).toMatchObject({ success: true, data: {} });
  });

  it("name được trim, email được trim và chuyển chữ thường", () => {
    const result = parse({ name: "  Nguyễn An  ", email: "  AN.Nguyen@Example.COM " });
    expect(result.success && result.data).toEqual({ name: "Nguyễn An", email: "an.nguyen@example.com" });
  });

  it.each(["role", "status", "password", "passwordHash", "password_hash", "id", "created_at", "foo"])(
    "field lạ %s -> lỗi, thông báo không lặp lại tên key",
    (key) => {
      const result = messages({ name: "An Nguyen", [key]: "x" });
      expect(result).toHaveLength(1);
      expect(result[0]).not.toContain(key);
    }
  );

  it("name rỗng hoặc chỉ khoảng trắng bị từ chối", () => {
    expect(parse({ name: "" }).success).toBe(false);
    expect(parse({ name: "     " }).success).toBe(false);
  });

  it("name: biên 2 và 100 ký tự ok, 1 và 101 bị từ chối", () => {
    expect(parse({ name: "ab" }).success).toBe(true);
    expect(parse({ name: "a".repeat(100) }).success).toBe(true);
    expect(parse({ name: "a" }).success).toBe(false);
    expect(parse({ name: "a".repeat(101) }).success).toBe(false);
    // 100 ký tự thật + khoảng trắng hai đầu: trim trước rồi mới đếm
    expect(parse({ name: `  ${"a".repeat(100)}  ` }).success).toBe(true);
  });

  it("name không được chứa xuống dòng hoặc ký tự điều khiển", () => {
    for (const bad of ["An\nNguyen", "An\r\nNguyen", "An\tNguyen", "An\u0000Nguyen", "An\u2028Nguyen"]) {
      expect(parse({ name: bad }).success).toBe(false);
    }
  });

  it("email sai định dạng hoặc quá 255 ký tự bị từ chối", () => {
    for (const bad of ["abc", "a@", "@b.com", "a b@c.com", `${"a".repeat(250)}@b.com`]) {
      expect(parse({ email: bad }).success).toBe(false);
    }
  });

  it("kiểu dữ liệu sai bị từ chối (không ném lỗi 500)", () => {
    for (const bad of [null, [], "text", 5, { name: 5 }, { email: null }, { name: ["a"] }]) {
      expect(parse(bad).success).toBe(false);
    }
  });
});