/**
 * T17 bước 4: test tích hợp POST /api/v1/attempts/audio (upload âm thanh bài Nói).
 * Gọi API thật (HTTP) + DB PostgreSQL thật (DATABASE_URL trong .env), như test T4.
 *
 * - Tự tạo user/lớp/bài/assignment riêng (tiền tố "t17api_"), xóa sạch sau khi chạy.
 * - Thư mục tạm và giới hạn dung lượng đặt qua biến môi trường TRƯỚC khi import app
 *   (env.ts đọc một lần lúc import): thư mục riêng trong thư mục tạm của hệ điều hành, 2048 byte.
 * - Quy tắc quyền kiểm bằng CHÍNH các hàm của POST /attempts; ở đây chứng minh kết quả khớp.
 * - Mọi ca bị từ chối vì quyền/bài/lượt phải KHÔNG tạo file trong thư mục tạm.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import jwt from "jsonwebtoken";

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "t17api_dir_"));
const TMP_DIR = path.join(SANDBOX, "audio");
const MAX = 2048;

process.env.AUDIO_TMP_DIR = TMP_DIR;
process.env.AUDIO_MAX_BYTES = String(MAX);

const PREFIX = "t17api_";
const RUN_ID = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

type Role = "ADMIN" | "TEACHER" | "STUDENT";
type UserStatus = "ACTIVE" | "PENDING" | "LOCKED";
type ExStatus = "DRAFT" | "PROPOSED" | "PUBLISHED" | "HIDDEN";

const users = { admin: 0, teacher: 0, student: 0, outsider: 0, pending: 0, locked: 0 };
const ids = { classA: 0, classB: 0 };
const ex: Record<string, number> = {};
const asg: Record<string, number> = {};

let server: Server;
let baseUrl = "";
let prisma: typeof import("../../config/prisma")["prisma"];
let env: typeof import("../../config/env")["env"];
let resolveAudioPath: (studentId: number, audioId: string) => string | null;

const HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Dữ liệu
// ---------------------------------------------------------------------------

const createUser = async (label: string, role: Role, status: UserStatus = "ACTIVE") => {
  const user = await prisma.user.create({
    data: {
      name: `${RUN_ID} ${label}`,
      email: `${RUN_ID}_${label}@test.local`,
      passwordHash: "not-a-real-hash",
      role,
      status,
    },
    select: { id: true },
  });
  return user.id;
};

const randomClassCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const createClass = async (name: string) =>
  (
    await prisma.class.create({
      data: { name: `${RUN_ID} ${name}`, code: randomClassCode(), teacherId: users.teacher },
      select: { id: true },
    })
  ).id;

const newExercise = async (
  label: string,
  type: "speaking" | "fill_blank",
  status: ExStatus,
  inLibrary: boolean
) =>
  (
    await prisma.exercise.create({
      data:
        type === "speaking"
          ? {
              type,
              skill: "SPEAKING",
              level: "A1",
              topic: `${RUN_ID} ${label}`,
              content: { prompt: "Talk about your day." },
              status,
              source: "TEACHER",
              inLibrary,
              createdById: users.teacher,
            }
          : {
              type,
              skill: "FOUNDATION",
              level: "A1",
              topic: `${RUN_ID} ${label}`,
              content: { text: "She ___ to school." },
              answer: ["goes"],
              status,
              source: "TEACHER",
              inLibrary,
              createdById: users.teacher,
            },
      select: { id: true },
    })
  ).id;

const newAssignment = async (classId: number, exerciseId: number, dueOffsetMs: number) =>
  (
    await prisma.assignment.create({
      data: {
        exerciseId,
        classId,
        assignedById: users.teacher,
        dueAt: new Date(Date.now() + dueOffsetMs),
      },
      select: { id: true },
    })
  ).id;

const cleanup = async (userIds: number[]) => {
  if (userIds.length === 0) return;
  await prisma.attempt.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.class.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.exercise.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

beforeAll(async () => {
  ({ prisma } = await import("../../config/prisma"));
  ({ env } = await import("../../config/env"));
  ({ resolveAudioPath } = await import("./attempts.audio.upload"));
  const { app } = await import("../../app");

  await prisma.$queryRaw`SELECT 1`;

  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await cleanup(leftovers.map((u) => u.id));

  users.admin = await createUser("admin", "ADMIN");
  users.teacher = await createUser("teacher", "TEACHER");
  users.student = await createUser("student", "STUDENT");
  users.outsider = await createUser("outsider", "STUDENT");
  users.pending = await createUser("pending", "STUDENT", "PENDING");
  users.locked = await createUser("locked", "STUDENT", "LOCKED");

  // Lớp A có student. Lớp B chỉ có outsider.
  ids.classA = await createClass("class_a");
  ids.classB = await createClass("class_b");
  await prisma.classMember.create({ data: { classId: ids.classA, studentId: users.student } });
  await prisma.classMember.create({ data: { classId: ids.classB, studentId: users.outsider } });

  // Bài tự luyện (thư viện) và các bài không hợp lệ cho tự luyện.
  ex.lib = await newExercise("lib", "speaking", "PUBLISHED", true);
  ex.notLib = await newExercise("not_lib", "speaking", "PUBLISHED", false);
  ex.draft = await newExercise("draft", "speaking", "DRAFT", false);
  ex.hidden = await newExercise("hidden", "speaking", "HIDDEN", true);
  ex.fill = await newExercise("fill", "fill_blank", "PUBLISHED", true);

  // Mỗi tình huống bài giao dùng một bài riêng (không đụng ràng buộc trùng bài + lớp).
  ex.aOk = await newExercise("a_ok", "speaking", "PUBLISHED", false);
  ex.aLate = await newExercise("a_late", "speaking", "PUBLISHED", false);
  ex.aLimit = await newExercise("a_limit", "speaking", "PUBLISHED", false);
  ex.aOther = await newExercise("a_other", "speaking", "PUBLISHED", false);
  ex.aDraft = await newExercise("a_draft", "speaking", "DRAFT", false);
  ex.aHidden = await newExercise("a_hidden", "speaking", "HIDDEN", false);
  ex.aFill = await newExercise("a_fill", "fill_blank", "PUBLISHED", false);

  asg.ok = await newAssignment(ids.classA, ex.aOk, 24 * HOUR);
  asg.late = await newAssignment(ids.classA, ex.aLate, -HOUR); // quá hạn: vẫn nhận
  asg.limit = await newAssignment(ids.classA, ex.aLimit, 24 * HOUR);
  asg.otherClass = await newAssignment(ids.classB, ex.aOther, 24 * HOUR);
  asg.draftEx = await newAssignment(ids.classA, ex.aDraft, 24 * HOUR);
  asg.hiddenEx = await newAssignment(ids.classA, ex.aHidden, 24 * HOUR);
  asg.wrongType = await newAssignment(ids.classA, ex.aFill, 24 * HOUR);

  // Đã dùng hết 3 lần cho asg.limit.
  for (let i = 0; i < 3; i++) {
    await prisma.attempt.create({
      data: {
        studentId: users.student,
        exerciseId: ex.aLimit,
        assignmentId: asg.limit,
        mode: "practice",
        answer: { text: `lần ${i + 1}` },
        score: null,
        maxScore: 10,
      },
    });
  }

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được server test");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (prisma) {
    await cleanup(Object.values(users).filter((id) => id > 0));
    await prisma.$disconnect();
  }
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Gọi API
// ---------------------------------------------------------------------------

const tokenOf = (userId: number) => jwt.sign({ userId }, env.JWT_SECRET);

const pad = (head: Buffer, size = 64) =>
  Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 0x11)]);
const WEBM = (size?: number) => pad(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), size);

interface ApiResult {
  status: number;
  text: string;
  body: {
    data: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
  };
}

interface Options {
  userId?: number; // không truyền = không gửi token
  data?: Buffer | null; // null = không gửi file
  type?: string;
  filename?: string;
}

const postAudio = async (query: string, opts: Options = {}): Promise<ApiResult> => {
  const headers: Record<string, string> = {};
  if (opts.userId !== undefined) headers.Authorization = `Bearer ${tokenOf(opts.userId)}`;

  const form = new FormData();
  if (opts.data !== null) {
    form.append(
      "audio",
      new Blob([new Uint8Array(opts.data ?? WEBM())], { type: opts.type ?? "audio/webm" }),
      opts.filename ?? "voice.webm"
    );
  }

  const res = await fetch(`${baseUrl}/api/v1/attempts/audio${query}`, {
    method: "POST",
    headers,
    body: form,
  });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) };
};

const student = (query: string, opts: Options = {}) =>
  postAudio(query, { userId: users.student, ...opts });

const filesInTmp = () => (fs.existsSync(TMP_DIR) ? fs.readdirSync(TMP_DIR) : []);
// Chỉ đếm attempt của các user do test này tạo (file test khác có thể chạy song song trên cùng DB).
const countAttempts = () =>
  prisma.attempt.count({
    where: { studentId: { in: Object.values(users).filter((id) => id > 0) } },
  });

/** Ca bị từ chối: đúng mã, đúng dạng { data: null, error }, KHÔNG có file, KHÔNG tạo attempt. */
const expectRejected = async (
  run: () => Promise<ApiResult>,
  status: number,
  code?: string
) => {
  const before = await countAttempts();
  const res = await run();

  expect(res.status).toBe(status);
  expect(res.body.data).toBeNull();
  expect(res.body.error).not.toBeNull();
  if (code) expect(res.body.error!.code).toBe(code);
  expect(res.text).not.toContain(SANDBOX);
  expect(filesInTmp()).toEqual([]);
  expect(await countAttempts()).toBe(before);
};

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("đúng: HS hợp lệ upload bài Nói", () => {
  it("tự luyện (thư viện) -> 201, file trong thư mục tạm, tên do server đặt, chưa tạo attempt", async () => {
    const before = await countAttempts();
    const res = await student(`?exerciseId=${ex.lib}`, { filename: "../../evil.webm" });

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    const data = res.body.data as { audio_id: string; size_bytes: number; mime: string };
    expect(Object.keys(data).sort()).toEqual(["audio_id", "mime", "size_bytes"]);
    expect(data.mime).toBe("audio/webm");
    expect(data.size_bytes).toBe(64);

    const files = filesInTmp();
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(`${users.student}__${data.audio_id}.webm`);
    expect(res.text).not.toContain("evil");
    expect(res.text).not.toContain(SANDBOX);

    // Chưa tạo attempt (T18 làm).
    expect(await countAttempts()).toBe(before);

    // resolveAudioPath cho T18: đúng HS thì có đường dẫn, HS khác thì null.
    const resolved = resolveAudioPath(users.student, data.audio_id);
    expect(resolved).not.toBeNull();
    expect(path.dirname(resolved as string)).toBe(TMP_DIR);
    expect(resolveAudioPath(users.outsider, data.audio_id)).toBeNull();
  });

  it("bài giao (chỉ assignmentId) -> 201", async () => {
    const res = await student(`?assignmentId=${asg.ok}`);
    expect(res.status).toBe(201);
    expect(filesInTmp()).toHaveLength(1);
  });

  it("bài giao, exerciseId khớp bài của lượt giao -> 201", async () => {
    const res = await student(`?assignmentId=${asg.ok}&exerciseId=${ex.aOk}`);
    expect(res.status).toBe(201);
  });

  it("nộp trễ hạn vẫn nhận -> 201", async () => {
    const res = await student(`?assignmentId=${asg.late}`);
    expect(res.status).toBe(201);
    expect(filesInTmp()).toHaveLength(1);
  });

  it("bài DRAFT được giao vẫn nhận, giống POST /attempts (chỉ chặn HIDDEN)", async () => {
    const res = await student(`?assignmentId=${asg.draftEx}`);
    expect(res.status).toBe(201);
  });

  it("studentId trong query bị bỏ: file luôn gắn với HS trong token", async () => {
    const res = await student(`?exerciseId=${ex.lib}&studentId=${users.outsider}`);
    expect(res.status).toBe(201);
    expect(filesInTmp()[0]).toMatch(new RegExp(`^${users.student}__`));
  });

  it("định dạng khác (mp3, wav) cũng qua khi bài hợp lệ", async () => {
    const mp3 = await student(`?exerciseId=${ex.lib}`, {
      data: pad(Buffer.from("ID3\x03\x00\x00", "latin1")),
      type: "audio/mpeg",
      filename: "a.mp3",
    });
    expect(mp3.status).toBe(201);
    expect(mp3.body.data!.mime).toBe("audio/mpeg");
  });
});

describe("quyền: bị từ chối, không tạo file", () => {
  it("không token -> 401", async () => {
    await expectRejected(() => postAudio(`?exerciseId=${ex.lib}`), 401, "UNAUTHORIZED");
  });

  it("token rác -> 401", async () => {
    await expectRejected(
      async () => {
        const form = new FormData();
        form.append("audio", new Blob([new Uint8Array(WEBM())], { type: "audio/webm" }), "a.webm");
        const res = await fetch(`${baseUrl}/api/v1/attempts/audio?exerciseId=${ex.lib}`, {
          method: "POST",
          headers: { Authorization: "Bearer khong-phai-token" },
          body: form,
        });
        const text = await res.text();
        return { status: res.status, text, body: JSON.parse(text) };
      },
      401
    );
  });

  it("TEACHER và ADMIN -> 403", async () => {
    await expectRejected(
      () => postAudio(`?exerciseId=${ex.lib}`, { userId: users.teacher }),
      403,
      "FORBIDDEN"
    );
    await expectRejected(
      () => postAudio(`?exerciseId=${ex.lib}`, { userId: users.admin }),
      403,
      "FORBIDDEN"
    );
  });

  it("vai trò kiểm TRƯỚC query: GV gửi query sai vẫn nhận 403 (không phải 400)", async () => {
    await expectRejected(() => postAudio("?exerciseId=abc", { userId: users.teacher }), 403);
    await expectRejected(() => postAudio("", { userId: users.admin }), 403);
  });

  // authenticate chặn tài khoản không ACTIVE bằng 401 (giống mọi route attempts hiện có).
  it("HS PENDING và LOCKED bị chặn (401, như POST /attempts)", async () => {
    await expectRejected(() => postAudio(`?exerciseId=${ex.lib}`, { userId: users.pending }), 401);
    await expectRejected(() => postAudio(`?exerciseId=${ex.lib}`, { userId: users.locked }), 401);
  });
});

describe("query không hợp lệ -> 400 VALIDATION_ERROR, không tạo file", () => {
  const bad = [
    "",
    "?exerciseId=abc",
    "?exerciseId=-1",
    "?exerciseId=0",
    "?exerciseId=1.5",
    "?exerciseId=",
    "?exerciseId=1e3",
    "?exerciseId=99999999999",
    "?assignmentId=abc",
    "?exerciseId=1&exerciseId=2",
  ];
  it.each(bad)("%s", async (query) => {
    await expectRejected(() => student(query), 400, "VALIDATION_ERROR");
  });
});

describe("bài/lượt giao: bị từ chối, không tạo file", () => {
  it("bài không phải speaking -> 400 AUDIO_WRONG_EXERCISE_TYPE (tự luyện và bài giao)", async () => {
    await expectRejected(() => student(`?exerciseId=${ex.fill}`), 400, "AUDIO_WRONG_EXERCISE_TYPE");
    await expectRejected(
      () => student(`?assignmentId=${asg.wrongType}`),
      400,
      "AUDIO_WRONG_EXERCISE_TYPE"
    );
  });

  it("tự luyện: bài DRAFT, HIDDEN, ngoài thư viện, không tồn tại -> 404", async () => {
    for (const id of [ex.draft, ex.hidden, ex.notLib, 2147483647]) {
      await expectRejected(() => student(`?exerciseId=${id}`), 404, "NOT_FOUND");
    }
  });

  it("bài giao: bài HIDDEN -> 404", async () => {
    await expectRejected(() => student(`?assignmentId=${asg.hiddenEx}`), 404, "NOT_FOUND");
  });

  it("assignmentId của lớp khác (HS không thuộc lớp) -> 404", async () => {
    await expectRejected(() => student(`?assignmentId=${asg.otherClass}`), 404, "NOT_FOUND");
    // và ngược lại: outsider không dùng được lượt giao của lớp A
    await expectRejected(
      () => postAudio(`?assignmentId=${asg.ok}`, { userId: users.outsider }),
      404,
      "NOT_FOUND"
    );
  });

  it("assignmentId không tồn tại -> 404", async () => {
    await expectRejected(() => student("?assignmentId=2147483647"), 404, "NOT_FOUND");
  });

  it("assignmentId không khớp exerciseId -> 400 VALIDATION_ERROR (như POST /attempts)", async () => {
    await expectRejected(
      () => student(`?assignmentId=${asg.ok}&exerciseId=${ex.lib}`),
      400,
      "VALIDATION_ERROR"
    );
  });

  it("đã đủ 3 lần nộp bài giao -> 409 ATTEMPT_LIMIT_REACHED (đúng mã POST /attempts)", async () => {
    await expectRejected(() => student(`?assignmentId=${asg.limit}`), 409, "ATTEMPT_LIMIT_REACHED");
  });
});

describe("đã qua kiểm quyền nhưng file sai -> không để lại file", () => {
  it("thiếu file -> 400 AUDIO_REQUIRED", async () => {
    await expectRejected(() => student(`?exerciseId=${ex.lib}`, { data: null }), 400, "AUDIO_REQUIRED");
  });

  it("đuôi .mp3, nội dung văn bản -> 400", async () => {
    await expectRejected(
      () =>
        student(`?exerciseId=${ex.lib}`, {
          data: Buffer.from("khong phai am thanh"),
          type: "audio/mpeg",
          filename: "x.mp3",
        }),
      400,
      "AUDIO_INVALID_FORMAT"
    );
  });

  it("png -> 400", async () => {
    await expectRejected(
      () =>
        student(`?exerciseId=${ex.lib}`, {
          data: pad(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
          type: "image/png",
          filename: "x.png",
        }),
      400,
      "AUDIO_INVALID_FORMAT"
    );
  });

  it("đúng bằng giới hạn -> 201; vượt 1 byte -> 413 và không còn file", async () => {
    const ok = await student(`?exerciseId=${ex.lib}`, { data: WEBM(MAX) });
    expect(ok.status).toBe(201);
    expect(ok.body.data!.size_bytes).toBe(MAX);
    fs.rmSync(TMP_DIR, { recursive: true, force: true });

    await expectRejected(
      () => student(`?exerciseId=${ex.lib}`, { data: WEBM(MAX + 1) }),
      413,
      "AUDIO_TOO_LARGE"
    );
  });
});

describe("không hồi quy POST /attempts", () => {
  it("nộp dạng speaking vẫn bị chặn 422 NOT_AUTO_GRADABLE, không tạo attempt", async () => {
    const before = await countAttempts();
    const res = await fetch(`${baseUrl}/api/v1/attempts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOf(users.student)}`,
      },
      body: JSON.stringify({ exerciseId: ex.lib, answer: { text: "Hello" } }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("NOT_AUTO_GRADABLE");
    expect(await countAttempts()).toBe(before);
  });
});