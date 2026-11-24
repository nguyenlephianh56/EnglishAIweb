import { describe, expect, it } from "vitest";
import {
  buildAdminUserDetail,
  pickLastActivityAt,
  type AdminUserProfile,
  type AdminUserStatsInput,
} from "./admin.users.detail";

const earlier = new Date("2026-11-20T03:00:00.000Z");
const later = new Date("2026-11-22T09:30:00.000Z");

const profile: AdminUserProfile = {
  id: 7,
  name: "Học sinh A",
  email: "a@example.com",
  role: "STUDENT",
  status: "ACTIVE",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
};

const stats: AdminUserStatsInput = {
  classesTeaching: 0,
  classesJoined: 2,
  attemptsCount: 5,
  exercisesCreated: 0,
  aiTotal: 9,
  aiToday: 3,
  lastAttemptAt: earlier,
  lastAiAt: later,
};

describe("pickLastActivityAt", () => {
  it("chọn ngày lớn hơn", () => {
    expect(pickLastActivityAt(earlier, later)).toEqual(later);
    expect(pickLastActivityAt(later, earlier)).toEqual(later);
  });

  it("một giá trị null thì lấy giá trị còn lại", () => {
    expect(pickLastActivityAt(earlier, null)).toEqual(earlier);
    expect(pickLastActivityAt(null, later)).toEqual(later);
  });

  it("cả hai null thì trả null", () => {
    expect(pickLastActivityAt(null, null)).toBeNull();
  });

  it("hai ngày bằng nhau thì trả đúng thời điểm đó", () => {
    expect(pickLastActivityAt(new Date(later), new Date(later))).toEqual(later);
  });

  it("bỏ qua ngày không hợp lệ", () => {
    expect(pickLastActivityAt(new Date("không phải ngày"), earlier)).toEqual(earlier);
    expect(pickLastActivityAt(new Date("không phải ngày"), null)).toBeNull();
  });
});

describe("buildAdminUserDetail", () => {
  it("ghép hồ sơ và stats đúng cấu trúc", () => {
    expect(buildAdminUserDetail(profile, stats)).toEqual({
      ...profile,
      stats: {
        classesTeaching: 0,
        classesJoined: 2,
        attemptsCount: 5,
        exercisesCreated: 0,
        aiRequests: { total: 9, today: 3 },
        lastActivityAt: later,
      },
    });
  });

  it("user chưa có dữ liệu: toàn 0 và lastActivityAt null", () => {
    const empty = buildAdminUserDetail(profile, {
      classesTeaching: 0,
      classesJoined: 0,
      attemptsCount: 0,
      exercisesCreated: 0,
      aiTotal: 0,
      aiToday: 0,
      lastAttemptAt: null,
      lastAiAt: null,
    });
    expect(empty.stats).toEqual({
      classesTeaching: 0,
      classesJoined: 0,
      attemptsCount: 0,
      exercisesCreated: 0,
      aiRequests: { total: 0, today: 0 },
      lastActivityAt: null,
    });
  });

  it("không lọt passwordHash hay field ngoài danh sách dù hàng DB có thừa", () => {
    const dirtyRow = { ...profile, passwordHash: "$2b$10$secret", password: "x", token: "t" };
    const result = buildAdminUserDetail(dirtyRow, stats);
    expect(Object.keys(result).sort()).toEqual(
      ["createdAt", "email", "id", "name", "role", "stats", "status"].sort()
    );
    expect(Object.keys(result.stats).sort()).toEqual(
      ["aiRequests", "attemptsCount", "classesJoined", "classesTeaching", "exercisesCreated", "lastActivityAt"].sort()
    );
    const json = JSON.stringify(result);
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("password");
    expect(json).not.toContain("token");
  });
});