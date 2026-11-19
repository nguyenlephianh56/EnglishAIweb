/**
 * Test đơn vị (KHÔNG cần DB) cho refreshProfileAfterGrading (T14, nối hồ sơ — bước 1).
 * recomputeSkillProfile được mock; db là đối tượng giả chỉ có attempt.findUnique.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { recomputeMock } = vi.hoisted(() => ({ recomputeMock: vi.fn() }));
vi.mock("./skill-profiles.recompute", () => ({ recomputeSkillProfile: recomputeMock }));

import { refreshProfileAfterGrading } from "./skill-profiles.refresh";

const makeDb = (row: unknown) => {
  const findUnique = vi.fn().mockResolvedValue(row);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { attempt: { findUnique } } as any, findUnique };
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  recomputeMock.mockReset();
  recomputeMock.mockResolvedValue(null);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("refreshProfileAfterGrading", () => {
  it("gọi recomputeSkillProfile đúng 1 lần với studentId của attempt và skill của bài", async () => {
    const { db, findUnique } = makeDb({ studentId: 7, exercise: { skill: "FOUNDATION" } });

    await refreshProfileAfterGrading(db, 42);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
      select: { studentId: true, exercise: { select: { skill: true } } },
    });
    expect(recomputeMock).toHaveBeenCalledTimes(1);
    expect(recomputeMock).toHaveBeenCalledWith(db, 7, "FOUNDATION");
  });

  it("attempt không tồn tại: không gọi recompute, không ném lỗi, không log", async () => {
    const { db } = makeDb(null);

    await expect(refreshProfileAfterGrading(db, 999)).resolves.toBeUndefined();

    expect(recomputeMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("recompute ném lỗi: hàm vẫn resolve, log chỉ có studentId, skill, mã lỗi (không có message)", async () => {
    const { db } = makeDb({ studentId: 7, exercise: { skill: "READING" } });
    recomputeMock.mockRejectedValue(
      Object.assign(new Error("NOI-DUNG-BAI-VIET-BI-MAT"), { code: "P2002" })
    );

    await expect(refreshProfileAfterGrading(db, 42)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    expect(logged).toContain("P2002");
    expect(logged).toContain("READING");
    expect(logged).toContain("7");
    expect(logged).not.toContain("NOI-DUNG-BAI-VIET-BI-MAT");
  });

  it("lỗi không có mã: log UNKNOWN kể cả khi tên lỗi chứa dữ liệu riêng", async () => {
    const { db } = makeDb({ studentId: 3, exercise: { skill: "WRITING" } });
    recomputeMock.mockRejectedValue(Object.assign(new TypeError("bai viet: I goes to school"), {
      name: "PRIVATE_ERROR_NAME",
    }));

    await expect(refreshProfileAfterGrading(db, 1)).resolves.toBeUndefined();

    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    expect(logged).toContain("UNKNOWN");
    expect(logged).not.toContain("PRIVATE_ERROR_NAME");
    expect(logged).not.toContain("I goes");
  });

  it("đọc attempt lỗi: không gọi recompute, không ném lỗi, log chỉ có mã", async () => {
    const findUnique = vi.fn().mockRejectedValue(Object.assign(new Error("secret"), { code: "P1001" }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = { attempt: { findUnique } } as any;

    await expect(refreshProfileAfterGrading(db, 5)).resolves.toBeUndefined();

    expect(recomputeMock).not.toHaveBeenCalled();
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    expect(logged).toContain("P1001");
    expect(logged).not.toContain("secret");
  });
});
