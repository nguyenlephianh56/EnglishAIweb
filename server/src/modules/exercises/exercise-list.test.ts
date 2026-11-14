/**
 * GET /api/v1/exercises: HTTP + PostgreSQL thật, không mock Prisma.
 * Tự tạo/dọn user và bài riêng; tiền tố t2list_ không trùng các file test khác.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import {
  Prisma,
  type Exercise,
  type ExerciseSource,
  type ExerciseStatus,
  type Level,
  type Role,
  type Skill,
  type UserStatus,
} from "@prisma/client";
import { app } from "../../app";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import type { ExerciseType } from "./exercise-content.schema";

const PREFIX = "t2list_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const SECRET_ANSWER = "t2list_secret_answer";
const SECRET_EXPLANATION = "t2list_secret_explanation";

const users = {
  admin: 0,
  teacherA: 0,
  teacherB: 0,
  student: 0,
  pending: 0,
  locked: 0,
};

const ex: Record<string, Exercise> = {};
let server: Server | undefined;
let baseUrl = "";

const STUDENT_KEYS = [
  "content",
  "id",
  "level",
  "skill",
  "topic",
  "type",
].sort();

const FULL_KEYS = [
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
].sort();

const SHAPES = {
  fill_blank: {
    content: { text: "She ___ to school." },
    answer: [SECRET_ANSWER],
  },
  multiple_choice: {
    content: {
      questions: [
        { q: "Choose a verb.", options: ["blue", "go"] },
      ],
    },
    answer: [1],
  },
  matching: {
    content: { left: ["cat"], right: ["mèo"] },
    answer: [[0, 0]],
  },
  error_correction: {
    content: { sentence: "She go to school.", wrong: "go" },
    answer: ["goes"],
  },
  listening_fill: {
    content: { script: "She ___ to school.", blanks: 1 },
    answer: ["goes"],
  },
  writing: {
    content: { prompt: "Describe your hometown.", minWords: 80 },
    answer: Prisma.DbNull,
  },
  speaking: {
    content: { prompt: "Describe your hometown." },
    answer: Prisma.DbNull,
  },
} satisfies Record<
  ExerciseType,
  {
    content: Prisma.InputJsonValue;
    answer: Prisma.InputJsonValue | typeof Prisma.DbNull;
  }
>;

interface FixtureDefinition {
  owner: "admin" | "teacherA" | "teacherB";
  status: ExerciseStatus;
  inLibrary?: boolean;
  source?: ExerciseSource;
  type?: ExerciseType;
  skill?: Skill;
  level?: Level;
  topic?: string;
}

const definitions: Record<string, FixtureDefinition> = {
  adminLibrary: {
    owner: "admin",
    status: "PUBLISHED",
    inLibrary: true,
    topic: "Travel basics",
  },
  adminDraft: {
    owner: "admin",
    status: "DRAFT",
    skill: "READING",
    level: "A2",
  },
  adminWriting: {
    owner: "admin",
    status: "PUBLISHED",
    inLibrary: true,
    type: "writing",
    skill: "WRITING",
    level: "B2",
    topic: "Travel writing",
  },
  adminListening: {
    owner: "admin",
    status: "PUBLISHED",
    inLibrary: true,
    type: "listening_fill",
    skill: "LISTENING",
    level: "B1",
  },
  adminSpeaking: {
    owner: "admin",
    status: "PUBLISHED",
    inLibrary: true,
    type: "speaking",
    skill: "SPEAKING",
    level: "B2",
  },
  adminMatching: {
    owner: "admin",
    status: "PUBLISHED",
    inLibrary: true,
    type: "matching",
    level: "A2",
  },
  adminCorrection: {
    owner: "admin",
    status: "PUBLISHED",
    inLibrary: true,
    type: "error_correction",
    skill: "WRITING",
    level: "B1",
  },
  aDraft: {
    owner: "teacherA",
    status: "DRAFT",
    topic: "Travel draft",
  },
  aProposed: {
    owner: "teacherA",
    status: "PROPOSED",
    level: "A2",
  },
  aHidden: {
    owner: "teacherA",
    status: "HIDDEN",
    level: "B1",
  },
  aLibrary: {
    owner: "teacherA",
    status: "PUBLISHED",
    inLibrary: true,
    topic: "Travel practice",
  },
  aPrivate: {
    owner: "teacherA",
    status: "PUBLISHED",
    level: "A2",
  },
  aAiDraft: {
    owner: "teacherA",
    status: "DRAFT",
    source: "AI",
    skill: "READING",
    level: "A2",
  },
  bDraft: {
    owner: "teacherB",
    status: "DRAFT",
  },
  // inLibrary=true nhưng chưa PUBLISHED: vẫn không phải bài thư viện.
  bProposed: {
    owner: "teacherB",
    status: "PROPOSED",
    inLibrary: true,
    level: "A2",
  },
  bHidden: {
    owner: "teacherB",
    status: "HIDDEN",
    inLibrary: true,
    level: "B1",
  },
  bLibrary: {
    owner: "teacherB",
    status: "PUBLISHED",
    inLibrary: true,
    type: "multiple_choice",
    skill: "READING",
    level: "A2",
    topic: "Travel reading",
  },
  bPrivate: {
    owner: "teacherB",
    status: "PUBLISHED",
  },
  bAiDraft: {
    owner: "teacherB",
    status: "DRAFT",
    source: "AI",
    skill: "READING",
    level: "A2",
  },
  adminSecondDraft: {
    owner: "admin",
    status: "DRAFT",
    level: "B1",
  },
  adminPrivate: {
    owner: "admin",
    status: "PUBLISHED",
    level: "B2",
  },
};

const LIBRARY_NAMES = [
  "adminLibrary",
  "adminWriting",
  "adminListening",
  "adminSpeaking",
  "adminMatching",
  "adminCorrection",
  "aLibrary",
  "bLibrary",
];

const TEACHER_A_NAMES = [
  ...LIBRARY_NAMES,
  "aDraft",
  "aProposed",
  "aHidden",
  "aPrivate",
  "aAiDraft",
];

const createUser = async (
  label: string,
  role: Role,
  status: UserStatus = "ACTIVE"
) => {
  const row = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`,
      email: `${RUN_ID}_${label}@test.local`,
      passwordHash: "not-a-real-hash",
      role,
      status,
    },
    select: { id: true },
  });
  return row.id;
};

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;

  await prisma.exercise.deleteMany({
    where: { createdById: { in: userIds } },
  });

  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL và database đang chạy."
    );
  }

  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((user) => user.id));

  users.admin = await createUser("admin", "ADMIN");
  users.teacherA = await createUser("teacher_a", "TEACHER");
  users.teacherB = await createUser("teacher_b", "TEACHER");
  users.student = await createUser("student", "STUDENT");
  users.pending = await createUser("pending", "TEACHER", "PENDING");
  users.locked = await createUser("locked", "STUDENT", "LOCKED");

  for (const [label, definition] of Object.entries(definitions)) {
    const type = definition.type ?? "fill_blank";

    ex[label] = await prisma.exercise.create({
      data: {
        type,
        skill: definition.skill ?? "FOUNDATION",
        level: definition.level ?? "A1",
        topic: `${RUN_ID} ${definition.topic ?? label}`,
        ...SHAPES[type],
        explanation: SECRET_EXPLANATION,
        status: definition.status,
        inLibrary: definition.inLibrary ?? false,
        source:
          definition.source ??
          (definition.owner === "admin" ? "ADMIN" : "TEACHER"),
        createdById: users[definition.owner],
        // Bài đầu có id nhỏ nhất nhưng mới nhất.
        // Các bài còn lại cùng createdAt để kiểm tra thứ tự theo id.
        createdAt: new Date(
          label === "adminLibrary"
            ? "2026-02-01T00:00:00Z"
            : "2026-01-01T00:00:00Z"
        ),
      },
    });
  }

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });

  const address = server?.address();
  if (!address || typeof address === "string") {
    throw new Error("Không mở được server test");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  try {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
    }

    await cleanup(Object.values(users).filter((id) => id > 0));
  } finally {
    await prisma.$disconnect();
  }
});

interface ListItem {
  id: number;
  [key: string]: unknown;
}

interface ListBody {
  data: {
    items: ListItem[];
    page: number;
    limit: number;
    total: number;
  } | null;
  error: {
    code: string;
    message: string;
  } | null;
}

const getList = async (
  userId?: number,
  query: Record<string, string> | string = {}
) => {
  const params = new URLSearchParams(query);
  if (!params.has("topic")) params.set("topic", RUN_ID);

  const headers: Record<string, string> = {};
  if (userId !== undefined) {
    headers.Authorization =
      `Bearer ${jwt.sign({ userId }, env.JWT_SECRET)}`;
  }

  const res = await fetch(
    `${baseUrl}/api/v1/exercises?${params}`,
    { headers }
  );

  const raw = await res.text();

  expect(raw).not.toMatch(/passwordHash|JWT_SECRET|GEMINI_API_KEY/);
  expect(raw).not.toContain(env.JWT_SECRET);

  return {
    status: res.status,
    raw,
    body: JSON.parse(raw) as ListBody,
  };
};

const expectNames = (body: ListBody, names: string[]) => {
  expect(body.error).toBeNull();
  expect(body.data?.total).toBe(names.length);

  expect(
    body.data?.items.map((row) => row.id).sort((a, b) => a - b)
  ).toEqual(
    names.map((name) => ex[name].id).sort((a, b) => a - b)
  );
};

describe("GET danh sách - quyền và che đáp án", () => {
  it("HS chỉ thấy PUBLISHED + inLibrary; mọi item chỉ có 6 field, kể cả writing/speaking", async () => {
    const r = await getList(users.student);

    expect(r.status).toBe(200);
    expectNames(r.body, LIBRARY_NAMES);

    for (const item of r.body.data!.items) {
      expect(Object.keys(item).sort()).toEqual(STUDENT_KEYS);
    }

    expect(r.raw).not.toMatch(/"(?:answer|explanation)"\s*:/);
    expect(r.raw).not.toContain(SECRET_ANSWER);
    expect(r.raw).not.toContain(SECRET_EXPLANATION);
  });

  it("bài AI DRAFT, inLibrary=false không xuất hiện cho HS", async () => {
    const r = await getList(users.student, {
      type: "fill_blank",
      skill: "READING",
      level: "A2",
    });

    expect(r.status).toBe(200);
    expectNames(r.body, []);

    for (const name of ["aAiDraft", "bAiDraft"]) {
      expect(ex[name]).toMatchObject({
        source: "AI",
        status: "DRAFT",
        inLibrary: false,
      });
    }
  });

  it.each(["DRAFT", "PROPOSED", "PUBLISHED", "HIDDEN"])(
    "HS gửi status=%s vẫn chỉ thấy thư viện, total không lộ bài riêng",
    async (status) => {
      const r = await getList(users.student, { status });

      expect(r.status).toBe(200);
      expectNames(r.body, LIBRARY_NAMES);
      expect(r.raw).not.toMatch(/"(?:answer|explanation)"\s*:/);
    }
  );

  it("GV A thấy bài mình mọi status + thư viện; không thấy bài riêng GV B/admin", async () => {
    const r = await getList(users.teacherA);

    expect(r.status).toBe(200);
    expectNames(r.body, TEACHER_A_NAMES);

    for (const item of r.body.data!.items) {
      expect(Object.keys(item).sort()).toEqual(FULL_KEYS);
      expect(item.explanation).toBe(SECRET_EXPLANATION);
    }

    expect(
      r.body.data?.items.find((item) => item.id === ex.aDraft.id)
        ?.answer
    ).toEqual([SECRET_ANSWER]);
  });

  it("GV B cũng chỉ thấy bài mình + thư viện", async () => {
    const r = await getList(users.teacherB);

    expect(r.status).toBe(200);
    expectNames(r.body, [
      ...LIBRARY_NAMES,
      "bDraft",
      "bProposed",
      "bHidden",
      "bPrivate",
      "bAiDraft",
    ]);
  });

  it("ADMIN thấy tất cả, đủ field và answer (writing/speaking là null)", async () => {
    const r = await getList(users.admin, { pageSize: "50" });

    expect(r.status).toBe(200);
    expectNames(r.body, Object.keys(definitions));

    for (const item of r.body.data!.items) {
      expect(Object.keys(item).sort()).toEqual(FULL_KEYS);
    }

    expect(
      r.body.data?.items.find(
        (item) => item.id === ex.adminDraft.id
      )?.answer
    ).toEqual([SECRET_ANSWER]);

    for (const name of ["adminWriting", "adminSpeaking"]) {
      expect(
        r.body.data?.items.find(
          (item) => item.id === ex[name].id
        )?.answer
      ).toBeNull();
    }
  });

  it("query thừa không thể đổi người sở hữu hay mở rộng quyền HS", async () => {
    const r = await getList(users.student, {
      createdById: String(users.teacherB),
      inLibrary: "false",
      source: "AI",
      studentId: String(users.admin),
    });

    expect(r.status).toBe(200);
    expectNames(r.body, LIBRARY_NAMES);
  });
});

describe("GET danh sách - bộ lọc", () => {
  it.each<{
    query: Record<string, string>;
    names: string[];
  }>([
    {
      query: { skill: "WRITING" },
      names: ["adminWriting", "adminCorrection"],
    },
    {
      query: { level: "B2" },
      names: ["adminWriting", "adminSpeaking", "adminPrivate"],
    },
    {
      query: { type: "multiple_choice" },
      names: ["bLibrary"],
    },
    {
      query: { topic: `  ${RUN_ID.toUpperCase()} TRAVEL  ` },
      names: [
        "adminLibrary",
        "adminWriting",
        "aDraft",
        "aLibrary",
        "bLibrary",
      ],
    },
    {
      query: { status: "DRAFT" },
      names: [
        "adminDraft",
        "aDraft",
        "aAiDraft",
        "bDraft",
        "bAiDraft",
        "adminSecondDraft",
      ],
    },
    {
      query: { status: "PROPOSED" },
      names: ["aProposed", "bProposed"],
    },
    {
      query: { status: "PUBLISHED" },
      names: [
        ...LIBRARY_NAMES,
        "aPrivate",
        "bPrivate",
        "adminPrivate",
      ],
    },
    {
      query: { status: "HIDDEN" },
      names: ["aHidden", "bHidden"],
    },
  ])("ADMIN lọc riêng $query", async ({ query, names }) => {
    const r = await getList(users.admin, query);

    expect(r.status).toBe(200);
    expectNames(r.body, names);
  });

  it("kết hợp cả skill, level, type, topic, status", async () => {
    const query = {
      skill: "READING",
      level: "A2",
      type: "multiple_choice",
      topic: `${RUN_ID} travel`,
      status: "PUBLISHED",
    };

    for (const userId of [
      users.admin,
      users.teacherA,
      users.student,
    ]) {
      const r = await getList(userId, query);

      expect(r.status).toBe(200);
      expectNames(r.body, ["bLibrary"]);
    }
  });

  it.each([
    {
      status: "DRAFT",
      names: ["aDraft", "aAiDraft"],
    },
    {
      status: "PROPOSED",
      names: ["aProposed"],
    },
    {
      status: "PUBLISHED",
      names: [...LIBRARY_NAMES, "aPrivate"],
    },
    {
      status: "HIDDEN",
      names: ["aHidden"],
    },
  ])(
    "GV A lọc status=$status vẫn giữ quyền trên cả hai nhánh OR",
    async ({ status, names }) => {
      const r = await getList(users.teacherA, { status });

      expect(r.status).toBe(200);
      expectNames(r.body, names);
    }
  );

  it("bộ lọc cũng áp dụng cho bài của mình và bài thư viện của người khác", async () => {
    const r = await getList(users.teacherA, {
      skill: "READING",
      level: "A2",
      type: "fill_blank",
    });

    expect(r.status).toBe(200);
    expectNames(r.body, ["aAiDraft"]);
  });

  it("HS lọc chủ đề vẫn không thấy bản nháp khớp chủ đề", async () => {
    const r = await getList(users.student, {
      topic: `${RUN_ID} travel`,
    });

    expect(r.status).toBe(200);
    expectNames(r.body, [
      "adminLibrary",
      "adminWriting",
      "aLibrary",
      "bLibrary",
    ]);
  });

  it("bộ lọc hợp lệ nhưng không khớp trả danh sách rỗng", async () => {
    const r = await getList(users.admin, {
      skill: "LISTENING",
      type: "writing",
    });

    expect(r.status).toBe(200);
    expectNames(r.body, []);
    expect(r.body.data).toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
  });
});

describe("GET danh sách - phân trang và thứ tự ổn định", () => {
  // adminLibrary mới nhất dù id nhỏ.
  // Các bài còn lại cùng createdAt nên id giảm dần.
  const orderedIds = () => [
    ex.adminLibrary.id,
    ...Object.values(ex)
      .slice(1)
      .reverse()
      .map((row) => row.id),
  ];

  it("dùng đúng khuôn assignments/attempts: items, page, limit, total; mặc định 1/20", async () => {
    const r = await getList(users.admin);

    expect(r.status).toBe(200);
    expect(r.body.error).toBeNull();

    expect(Object.keys(r.body).sort()).toEqual([
      "data",
      "error",
    ]);
    expect(Object.keys(r.body.data!).sort()).toEqual([
      "items",
      "limit",
      "page",
      "total",
    ]);

    expect(r.body.data).toMatchObject({
      page: 1,
      limit: 20,
      total: 21,
    });
    expect(
      r.body.data?.items.map((row) => row.id)
    ).toEqual(orderedIds().slice(0, 20));
  });

  it("trang 1/2/3 đủ kích thước, không trùng/thiếu; trang vượt cuối vẫn giữ total", async () => {
    const collected: number[] = [];

    for (const page of [1, 2, 3, 4]) {
      const r = await getList(users.admin, {
        page: String(page),
        pageSize: "8",
      });

      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({
        page,
        limit: 8,
        total: 21,
      });

      const ids = r.body.data!.items.map((row) => row.id);

      expect(ids).toEqual(
        orderedIds().slice((page - 1) * 8, page * 8)
      );
      collected.push(...ids);
    }

    expect(collected).toEqual(orderedIds());

    const repeated = await getList(users.admin, {
      page: "2",
      pageSize: "8",
    });
    expect(
      repeated.body.data?.items.map((row) => row.id)
    ).toEqual(orderedIds().slice(8, 16));
  });

  it("lọc trước khi phân trang/count, không đếm các dòng ngoài bộ lọc", async () => {
    const r = await getList(users.admin, {
      status: "DRAFT",
      page: "2",
      pageSize: "2",
    });

    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      page: 2,
      limit: 2,
      total: 6,
    });
    expect(
      r.body.data?.items.map((row) => row.id)
    ).toEqual([ex.bDraft.id, ex.aAiDraft.id]);
  });

  it.each(["student", "teacherA"] as const)(
    "%s: phân trang và total chỉ dựa trên bài có quyền xem",
    async (role) => {
      const names =
        role === "student" ? LIBRARY_NAMES : TEACHER_A_NAMES;
      const allowedIds = names.map((name) => ex[name].id);
      const expected = orderedIds().filter((id) =>
        allowedIds.includes(id)
      );
      const collected: number[] = [];

      for (
        let page = 1;
        page <= Math.ceil(names.length / 3) + 1;
        page++
      ) {
        const r = await getList(users[role], {
          page: String(page),
          pageSize: "3",
        });

        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({
          page,
          limit: 3,
          total: names.length,
        });

        const ids = r.body.data!.items.map((row) => row.id);

        expect(ids).toEqual(
          expected.slice((page - 1) * 3, page * 3)
        );
        collected.push(...ids);

        if (role === "student") {
          expect(r.raw).not.toMatch(
            /"(?:answer|explanation)"\s*:/
          );
        }
      }

      expect(collected).toEqual(expected);
    }
  );

  it("nhận các biên page/pageSize hợp lệ", async () => {
    const r = await getList(users.admin, {
      page: "100000",
      pageSize: "1",
    });

    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      items: [],
      page: 100000,
      limit: 1,
      total: 21,
    });
  });
});

describe("GET danh sách - query sai và xác thực", () => {
  it.each([
    "skill=grammar",
    "skill=reading",
    "skill=",
    "level=A0",
    "level=C1",
    "level=",
    "type=unknown",
    "type=FILL_BLANK",
    "type=",
    "status=ARCHIVED",
    "status=draft",
    "status=",
    "topic=",
    "topic=%20%20",
    `topic=${"x".repeat(201)}`,
    "page=0",
    "page=-1",
    "page=1.5",
    "page=abc",
    "page=",
    "page=1e2",
    "page=%2B1",
    "page=%201",
    "page=100001",
    "page=9007199254740992",
    "page=Infinity",
    "pageSize=0",
    "pageSize=-1",
    "pageSize=1.5",
    "pageSize=abc",
    "pageSize=",
    "pageSize=1e1",
    "pageSize=51",
    "pageSize=9007199254740992",
    "pageSize=NaN",
    "skill=READING&skill=WRITING",
    "level=A1&level=A2",
    "type=writing&type=fill_blank",
    "topic=one&topic=two",
    "status=DRAFT&status=PUBLISHED",
    "page=1&page=2",
    "pageSize=1&pageSize=2",
    "skill[]=READING",
    "level[]=A1",
    "type[]=writing",
    "topic[]=one",
    "status[]=DRAFT",
    "page[]=1",
    "pageSize[]=2",
    "skill[x]=READING",
    "level[x]=A1",
    "type[x]=writing",
    "topic[x]=one",
    "status[x]=DRAFT",
    "page[x]=1",
    "pageSize[x]=2",
  ])("%s -> 400 VALIDATION_ERROR", async (query) => {
    const r = await getList(users.admin, query);

    expect(r.status).toBe(400);
    expect(r.body.data).toBeNull();
    expect(r.body.error?.code).toBe("VALIDATION_ERROR");
    expect(r.body.error?.message.length).toBeGreaterThan(0);
  });

  it("HS gửi status sai vẫn nhận 400, không bị bỏ qua bước validate", async () => {
    const r = await getList(users.student, {
      status: "ARCHIVED",
    });

    expect(r.status).toBe(400);
    expect(r.body.data).toBeNull();
    expect(r.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("không có token -> 401 (authenticate chạy trước validate query)", async () => {
    const r = await getList(undefined, { page: "invalid" });

    expect(r.status).toBe(401);
    expect(r.body.data).toBeNull();
    expect(r.body.error?.code).toBe("UNAUTHORIZED");
  });

  it.each(["pending", "locked"] as const)(
    "tài khoản %s -> 401",
    async (role) => {
      const r = await getList(users[role]);

      expect(r.status).toBe(401);
      expect(r.body.data).toBeNull();
      expect(r.body.error?.code).toBe("UNAUTHORIZED");
    }
  );
});