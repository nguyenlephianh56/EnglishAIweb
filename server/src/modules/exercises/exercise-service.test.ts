import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// Prisma giả: test này chỉ kiểm tra LOGIC của service, không cần DB thật.
// (Test với DB thật nằm ở bước test tích hợp.)
vi.mock("../../config/prisma", () => ({
  prisma: { exercise: { create: vi.fn() } },
}));

import { prisma } from "../../config/prisma";
import { createExercise } from "./exercises.service";
import { createExerciseSchema } from "./exercises.schema";

const createMock = prisma.exercise.create as unknown as ReturnType<typeof vi.fn>;

const teacher = { id: 7, role: "TEACHER", status: "ACTIVE" } as const;
const admin = { id: 1, role: "ADMIN", status: "ACTIVE" } as const;

/** Body thô -> qua schema body (như middleware validate sẽ làm) -> input cho service. */
const makeInput = (body: Record<string, unknown>) =>
  createExerciseSchema.parse({
    type: "fill_blank",
    skill: "FOUNDATION",
    level: "A1",
    topic: "Present simple",
    content: { text: "She ___ to school." },
    answer: ["goes"],
    ...body,
  });

const writingBody = {
  type: "writing",
  skill: "WRITING",
  content: { prompt: "Describe your hometown.", minWords: 80 },
  answer: undefined,
};

/** Dữ liệu service đã truyền vào prisma.exercise.create */
const lastData = () => createMock.mock.calls[0][0].data;

beforeEach(() => {
  createMock.mockReset();
  createMock.mockImplementation(async (args: { data: unknown }) => ({
    id: 100,
    ...(args.data as object),
  }));
});

describe("createExercise - đặt giá trị do server quyết định", () => {
  it("TEACHER: source=TEACHER, DRAFT, inLibrary=false, createdById = user", async () => {
    await createExercise(teacher, makeInput({}));
    const data = lastData();
    expect(data.source).toBe("TEACHER");
    expect(data.status).toBe("DRAFT");
    expect(data.inLibrary).toBe(false);
    expect(data.createdById).toBe(7);
  });

  it("TEACHER gửi publish=true vẫn là DRAFT, inLibrary=false", async () => {
    await createExercise(teacher, makeInput({ publish: true }));
    expect(lastData().status).toBe("DRAFT");
    expect(lastData().inLibrary).toBe(false);
    expect(lastData().source).toBe("TEACHER");
  });

  it("TEACHER gửi status/source/inLibrary/createdById giả thì bị bỏ qua", async () => {
    await createExercise(
      teacher,
      makeInput({
        status: "PUBLISHED",
        source: "ADMIN",
        inLibrary: true,
        in_library: true,
        createdById: 999,
        created_by_id: 999,
      })
    );
    const data = lastData();
    expect(data.status).toBe("DRAFT");
    expect(data.source).toBe("TEACHER");
    expect(data.inLibrary).toBe(false);
    expect(data.createdById).toBe(7);
  });

  it("ADMIN không publish: source=ADMIN, DRAFT, inLibrary=false", async () => {
    await createExercise(admin, makeInput({}));
    expect(lastData().source).toBe("ADMIN");
    expect(lastData().status).toBe("DRAFT");
    expect(lastData().inLibrary).toBe(false);
    expect(lastData().createdById).toBe(1);
  });

  it("ADMIN publish=false vẫn là DRAFT", async () => {
    await createExercise(admin, makeInput({ publish: false }));
    expect(lastData().status).toBe("DRAFT");
    expect(lastData().inLibrary).toBe(false);
  });

  it("ADMIN publish=true: PUBLISHED, inLibrary=true", async () => {
    await createExercise(admin, makeInput({ publish: true }));
    expect(lastData().source).toBe("ADMIN");
    expect(lastData().status).toBe("PUBLISHED");
    expect(lastData().inLibrary).toBe(true);
  });
});

describe("createExercise - dữ liệu ghi xuống DB", () => {
  it("chỉ truyền đúng các field cần thiết (không lọt field thừa)", async () => {
    await createExercise(teacher, makeInput({ publish: true, id: 5, foo: "bar" }));
    expect(Object.keys(lastData()).sort()).toEqual(
      [
        "answer",
        "content",
        "createdById",
        "explanation",
        "inLibrary",
        "level",
        "skill",
        "source",
        "status",
        "topic",
        "type",
      ].sort()
    );
  });

  it("writing không có answer -> lưu SQL NULL (Prisma.DbNull)", async () => {
    await createExercise(teacher, makeInput(writingBody));
    expect(lastData().answer).toBe(Prisma.DbNull);
  });

  it("explanation rỗng -> null; có giá trị -> giữ (đã trim)", async () => {
    await createExercise(teacher, makeInput({}));
    expect(lastData().explanation).toBeNull();

    createMock.mockClear();
    await createExercise(teacher, makeInput({ explanation: "  Ngôi thứ 3 thêm es  " }));
    expect(lastData().explanation).toBe("Ngôi thứ 3 thêm es");
  });

  it("select đúng 14 field trả về cho người tạo", async () => {
    await createExercise(teacher, makeInput({}));
    const { select } = createMock.mock.calls[0][0];
    expect(Object.keys(select).sort()).toEqual(
      [
        "answer",
        "content",
        "createdAt",
        "createdById",
        "explanation",
        "id",
        "inLibrary",
        "level",
        "skill",
        "source",
        "status",
        "topic",
        "type",
        "updatedAt",
      ].sort()
    );
    expect(Object.values(select).every((v) => v === true)).toBe(true);
  });

  it("trả về đúng kết quả Prisma trả", async () => {
    const result = await createExercise(teacher, makeInput({}));
    expect(result).toMatchObject({ id: 100, createdById: 7 });
  });
});

describe("createExercise - validate bằng T1 (400)", () => {
  const expect400 = async (body: Record<string, unknown>, pathRegex: RegExp) => {
    await expect(createExercise(teacher, makeInput(body))).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: expect.stringMatching(pathRegex),
    });
    expect(createMock).not.toHaveBeenCalled();
  };

  it("thiếu content", async () => {
    await expect400({ content: undefined }, /content/);
  });

  it("answer lệch độ dài so với content", async () => {
    await expect400({ answer: ["goes", "extra"] }, /answer/);
  });

  it("writing có answer", async () => {
    await expect400({ ...writingBody, answer: ["x"] }, /answer/);
  });

  it("thiếu answer ở dạng bắt buộc có answer", async () => {
    await expect400({ answer: undefined }, /answer/);
  });
});

describe("createExercise - phòng thủ quyền", () => {
  it("STUDENT -> 403, không ghi DB", async () => {
    await expect(
      createExercise({ id: 3, role: "STUDENT", status: "ACTIVE" }, makeInput({}))
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "LOCKED"] as const)("TEACHER %s -> 403, không ghi DB", async (status) => {
    await expect(
      createExercise({ id: 7, role: "TEACHER", status }, makeInput({}))
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(createMock).not.toHaveBeenCalled();
  });
});