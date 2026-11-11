/**
 * Test thuần (không DB) cho GET /assignments: tính status, bestScore, danh sách trắng field,
 * và schema query. Chạy nhanh, không cần Docker.
 */
import { describe, it, expect } from "vitest";
import {
  buildSubmissionsResponse,
  computeStatus,
  toStudentAssignmentDetail,
  toStudentAssignmentItem,
  toSubmissionItem,
  toTeacherAssignmentItem,
} from "./assignments-view";
import {
  assignmentIdParamSchema,
  listAssignmentsQuerySchema,
} from "./assignments.schema";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-11-11T10:00:00.000Z");
const at = (offsetHours: number) => new Date(now.getTime() + offsetHours * HOUR);

describe("computeStatus", () => {
  it("chưa nộp, còn hạn -> NOT_STARTED", () => {
    expect(computeStatus(0, at(24), now)).toBe("NOT_STARTED");
  });
  it("chưa nộp, đúng hạn chót (now == dueAt) -> vẫn NOT_STARTED", () => {
    expect(computeStatus(0, now, now)).toBe("NOT_STARTED");
  });
  it("chưa nộp, quá hạn 1ms -> OVERDUE", () => {
    expect(computeStatus(0, new Date(now.getTime() - 1), now)).toBe("OVERDUE");
  });
  it("đã nộp trước hạn -> SUBMITTED", () => {
    expect(computeStatus(1, at(24), now)).toBe("SUBMITTED");
  });
  it("đã nộp mà nay quá hạn -> vẫn SUBMITTED (không thành OVERDUE)", () => {
    expect(computeStatus(3, at(-24), now)).toBe("SUBMITTED");
  });
});

const exerciseWithSecrets = {
  id: 7,
  type: "fill_blank",
  skill: "FOUNDATION",
  level: "A1",
  topic: "Present simple",
  // Các field này KHÔNG được lọt ra:
  content: { text: "She ___ to school." },
  answer: ["zebraquux"],
  explanation: "EXPL_secret",
  status: "PUBLISHED",
  createdById: 1,
};

describe("toStudentAssignmentItem", () => {
  const row = {
    id: 11,
    dueAt: at(24),
    exercise: exerciseWithSecrets,
    class: { id: 3, name: "Lớp A", teacherId: 99, code: "ABC123" },
  };

  it("chưa có attempt: attemptsUsed 0, bestScore null, lateSubmission false", () => {
    const item = toStudentAssignmentItem(row, undefined, now);
    expect(item).toMatchObject({
      assignmentId: 11,
      status: "NOT_STARTED",
      attemptsUsed: 0,
      maxAttempts: 3,
      bestScore: null,
      lateSubmission: false,
    });
  });

  it("có attempt: lấy attemptsUsed, làm tròn bestScore 2 chữ số, cờ trễ", () => {
    const item = toStudentAssignmentItem(
      row,
      { attemptsUsed: 2, best: 6.666666, late: true },
      now
    );
    expect(item.status).toBe("SUBMITTED");
    expect(item.attemptsUsed).toBe(2);
    expect(item.bestScore).toBe(6.67);
    expect(item.lateSubmission).toBe(true);
  });

  it("bestScore = 0 (GV chấm 0) vẫn là 0, không bị đổi thành null", () => {
    const item = toStudentAssignmentItem(
      row,
      { attemptsUsed: 1, best: 0, late: false },
      now
    );
    expect(item.bestScore).toBe(0);
  });

  it("attempt chưa có điểm (best null) -> bestScore null nhưng vẫn SUBMITTED", () => {
    const item = toStudentAssignmentItem(
      row,
      { attemptsUsed: 1, best: null, late: false },
      now
    );
    expect(item.status).toBe("SUBMITTED");
    expect(item.bestScore).toBeNull();
  });

  it("danh sách trắng: đúng các key, không có answer/explanation/content/code/teacherId", () => {
    const item = toStudentAssignmentItem(row, undefined, now);
    expect(Object.keys(item).sort()).toEqual(
      [
        "assignmentId",
        "attemptsUsed",
        "bestScore",
        "class",
        "dueAt",
        "exercise",
        "lateSubmission",
        "maxAttempts",
        "status",
      ].sort()
    );
    expect(Object.keys(item.exercise).sort()).toEqual(
      ["id", "level", "skill", "topic", "type"].sort()
    );
    expect(Object.keys(item.class).sort()).toEqual(["id", "name"]);
    const json = JSON.stringify(item);
    expect(json).not.toContain("zebraquux");
    expect(json).not.toContain("EXPL_secret");
    expect(json).not.toContain("ABC123");
  });
});

describe("toTeacherAssignmentItem", () => {
  const row = {
    id: 12,
    dueAt: at(48),
    remindBeforeH: [24, 1],
    createdAt: at(-1),
    exercise: exerciseWithSecrets,
    class: { id: 3, name: "Lớp A", _count: { members: 30 }, code: "ABC123" },
  };

  it("kèm submittedCount / totalStudents, đổi tên remindBeforeHours", () => {
    const item = toTeacherAssignmentItem(row, 12);
    expect(item.submittedCount).toBe(12);
    expect(item.totalStudents).toBe(30);
    expect(item.remindBeforeHours).toEqual([24, 1]);
  });

  it("danh sách trắng: không có answer/explanation/content/code", () => {
    const item = toTeacherAssignmentItem(row, 0);
    expect(Object.keys(item).sort()).toEqual(
      [
        "assignmentId",
        "class",
        "createdAt",
        "dueAt",
        "exercise",
        "remindBeforeHours",
        "submittedCount",
        "totalStudents",
      ].sort()
    );
    const json = JSON.stringify(item);
    expect(json).not.toContain("zebraquux");
    expect(json).not.toContain("EXPL_secret");
    expect(json).not.toContain("ABC123");
  });
});

describe("listAssignmentsQuerySchema", () => {
  const parse = (q: unknown) => listAssignmentsQuerySchema.safeParse(q);

  it("rỗng -> mặc định page 1, limit 20", () => {
    const r = parse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ page: 1, limit: 20 });
    }
  });

  it("đổi chuỗi sang số", () => {
    const r = parse({ status: "OVERDUE", classId: "5", page: "2", limit: "50" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ status: "OVERDUE", classId: 5, page: 2, limit: 50 });
    }
  });

  it("bỏ query thừa (studentId)", () => {
    const r = parse({ studentId: "9" });
    expect(r.success).toBe(true);
    if (r.success) expect("studentId" in r.data).toBe(false);
  });

  it.each([
    ["status sai", { status: "LATE" }],
    ["status viết thường", { status: "overdue" }],
    ["status lặp (mảng)", { status: ["OVERDUE", "SUBMITTED"] }],
    ["classId chữ", { classId: "abc" }],
    ["classId âm", { classId: "-1" }],
    ["classId thập phân", { classId: "1.5" }],
    ["classId 0", { classId: "0" }],
    ["classId vượt INT", { classId: "99999999999" }],
    ["page 0", { page: "0" }],
    ["page chữ", { page: "x" }],
    ["page quá lớn", { page: "100001" }],
    ["limit 0", { limit: "0" }],
    ["limit 51", { limit: "51" }],
    ["limit rỗng", { limit: "" }],
  ])("%s -> lỗi", (_name, q) => {
    expect(parse(q).success).toBe(false);
  });
});

describe("toStudentAssignmentDetail", () => {
  // Cố ý nhét thêm answer/status/createdById để chắc chắn chúng không lọt ra.
  const makeRow = (dueAt: Date, explanation: string | null = "EXPL_secret") => ({
    id: 21,
    dueAt,
    exercise: {
      id: 7,
      type: "fill_blank",
      skill: "FOUNDATION",
      level: "A1",
      topic: "Present simple",
      content: { text: "She ___ to school." },
      explanation,
      answer: ["zebraquux"],
      status: "PUBLISHED",
      createdById: 1,
    },
    class: { id: 3, name: "Lớp A", code: "ABC123" },
  });

  it("trước hạn: có content, KHÔNG có key explanation, KHÔNG có answer", () => {
    const detail = toStudentAssignmentDetail(makeRow(at(24)), undefined, now);
    expect(detail.exercise.content).toEqual({ text: "She ___ to school." });
    expect("explanation" in detail.exercise).toBe(false);
    expect("answer" in detail.exercise).toBe(false);
    const json = JSON.stringify(detail);
    expect(json).not.toContain("zebraquux");
    expect(json).not.toContain("EXPL_secret");
  });

  it("đúng hạn chót (now == dueAt): chưa lộ explanation", () => {
    const detail = toStudentAssignmentDetail(makeRow(now), undefined, now);
    expect("explanation" in detail.exercise).toBe(false);
  });

  it("quá hạn 1ms: có explanation, vẫn KHÔNG có answer", () => {
    const detail = toStudentAssignmentDetail(
      makeRow(new Date(now.getTime() - 1)),
      undefined,
      now
    );
    expect(detail.exercise.explanation).toBe("EXPL_secret");
    expect("answer" in detail.exercise).toBe(false);
    expect(JSON.stringify(detail)).not.toContain("zebraquux");
  });

  it("quá hạn mà bài không có giải thích: explanation = null (key vẫn có)", () => {
    const detail = toStudentAssignmentDetail(makeRow(at(-1), null), undefined, now);
    expect("explanation" in detail.exercise).toBe(true);
    expect(detail.exercise.explanation).toBeNull();
  });

  it("danh sách trắng: đúng key ở ngoài, ở exercise và ở class", () => {
    const detail = toStudentAssignmentDetail(
      makeRow(at(-1)),
      { attemptsUsed: 2, best: 8, late: true },
      now
    );
    expect(Object.keys(detail).sort()).toEqual(
      [
        "assignmentId",
        "attemptsUsed",
        "bestScore",
        "class",
        "dueAt",
        "exercise",
        "lateSubmission",
        "maxAttempts",
        "status",
      ].sort()
    );
    expect(Object.keys(detail.exercise).sort()).toEqual(
      ["content", "explanation", "id", "level", "skill", "topic", "type"].sort()
    );
    expect(Object.keys(detail.class).sort()).toEqual(["id", "name"]);
    expect(JSON.stringify(detail)).not.toContain("ABC123");
  });

  it("kèm đúng status / attemptsUsed / bestScore như danh sách", () => {
    const detail = toStudentAssignmentDetail(
      makeRow(at(24)),
      { attemptsUsed: 1, best: 5.555, late: false },
      now
    );
    expect(detail).toMatchObject({
      assignmentId: 21,
      status: "SUBMITTED",
      attemptsUsed: 1,
      maxAttempts: 3,
      bestScore: 5.56,
      lateSubmission: false,
    });
  });
});

describe("assignmentIdParamSchema", () => {
  it("đổi chuỗi sang số", () => {
    const r = assignmentIdParamSchema.safeParse({ id: "12" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.id).toBe(12);
  });

  it.each([["abc"], [""], ["0"], ["-1"], ["1.5"], ["1e3"], [" 5"], ["99999999999"]])(
    "id %j -> lỗi",
    (id) => {
      expect(assignmentIdParamSchema.safeParse({ id }).success).toBe(false);
    }
  );
});

describe("toSubmissionItem / buildSubmissionsResponse", () => {
  // Cố ý nhét passwordHash/role vào để chắc chắn không lọt ra.
  const student = (id: number, name: string) => ({
    id,
    name,
    email: `${name}@test.local`,
    passwordHash: "SECRET_HASH",
    role: "STUDENT",
  });
  const submittedAt = at(-2);

  it("HS chưa làm, còn hạn -> NOT_STARTED, mọi số liệu rỗng", () => {
    const item = toSubmissionItem(student(1, "an"), undefined, at(24), now);
    expect(item).toEqual({
      studentId: 1,
      name: "an",
      email: "an@test.local",
      status: "NOT_STARTED",
      attemptsUsed: 0,
      bestScore: null,
      bestAttemptId: null,
      lastSubmittedAt: null,
      lateSubmission: false,
    });
  });

  it("HS chưa làm, quá hạn -> OVERDUE", () => {
    const item = toSubmissionItem(student(1, "an"), undefined, at(-1), now);
    expect(item.status).toBe("OVERDUE");
  });

  it("HS đã nộp: SUBMITTED, điểm làm tròn, id lần cao nhất, cờ trễ, lần nộp cuối", () => {
    const item = toSubmissionItem(
      student(2, "binh"),
      { attemptsUsed: 3, best: 7.777, bestAttemptId: 42, late: true, lastSubmittedAt: submittedAt },
      at(-1),
      now
    );
    expect(item).toMatchObject({
      status: "SUBMITTED",
      attemptsUsed: 3,
      bestScore: 7.78,
      bestAttemptId: 42,
      lateSubmission: true,
      lastSubmittedAt: submittedAt,
    });
  });

  it("bestScore = 0 (GV chấm 0) vẫn là 0 và vẫn có bestAttemptId", () => {
    const item = toSubmissionItem(
      student(3, "chi"),
      { attemptsUsed: 1, best: 0, bestAttemptId: 7, late: false, lastSubmittedAt: submittedAt },
      at(24),
      now
    );
    expect(item.bestScore).toBe(0);
    expect(item.bestAttemptId).toBe(7);
  });

  it("đã nộp nhưng chưa có điểm (best null) -> SUBMITTED, bestScore và bestAttemptId đều null", () => {
    const item = toSubmissionItem(
      student(4, "dung"),
      { attemptsUsed: 1, best: null, bestAttemptId: 9, late: false, lastSubmittedAt: submittedAt },
      at(24),
      now
    );
    expect(item.status).toBe("SUBMITTED");
    expect(item.bestScore).toBeNull();
    expect(item.bestAttemptId).toBeNull();
  });

  it("danh sách trắng: đúng key, không có passwordHash/role", () => {
    const item = toSubmissionItem(student(1, "an"), undefined, at(24), now);
    expect(Object.keys(item).sort()).toEqual(
      [
        "attemptsUsed",
        "bestAttemptId",
        "bestScore",
        "email",
        "lastSubmittedAt",
        "lateSubmission",
        "name",
        "status",
        "studentId",
      ].sort()
    );
    expect(JSON.stringify(item)).not.toContain("SECRET_HASH");
  });

  const assignment = {
    id: 5,
    dueAt: at(-1),
    exercise: { id: 7, type: "fill_blank", skill: "FOUNDATION", level: "A1", topic: "t" },
    class: { id: 3, name: "Lớp A" },
  };

  it("buildSubmissionsResponse: đủ mọi HS (kể cả chưa làm), giữ thứ tự, đếm đúng", () => {
    const stats = new Map([
      [2, { attemptsUsed: 1, best: 6, bestAttemptId: 11, late: false, lastSubmittedAt: submittedAt }],
    ]);
    const res = buildSubmissionsResponse(
      assignment,
      [student(1, "an"), student(2, "binh"), student(3, "chi")],
      stats,
      now
    );
    expect(res.items.map((i) => i.studentId)).toEqual([1, 2, 3]);
    expect(res.items.map((i) => i.status)).toEqual(["OVERDUE", "SUBMITTED", "OVERDUE"]);
    expect(res.totalStudents).toBe(3);
    expect(res.submittedCount).toBe(1);
    expect(res.assignment).toEqual({
      assignmentId: 5,
      exercise: assignment.exercise,
      class: { id: 3, name: "Lớp A" },
      dueAt: assignment.dueAt,
      maxAttempts: 3,
    });
  });

  it("buildSubmissionsResponse: số liệu của người không thuộc lớp bị bỏ qua", () => {
    const stats = new Map([
      [99, { attemptsUsed: 3, best: 10, bestAttemptId: 1, late: false, lastSubmittedAt: submittedAt }],
    ]);
    const res = buildSubmissionsResponse(assignment, [student(1, "an")], stats, now);
    expect(res.items.map((i) => i.studentId)).toEqual([1]);
    expect(res.submittedCount).toBe(0);
  });

  it("lớp không có HS -> items rỗng, các số đếm bằng 0", () => {
    const res = buildSubmissionsResponse(assignment, [], new Map(), now);
    expect(res.items).toEqual([]);
    expect(res.totalStudents).toBe(0);
    expect(res.submittedCount).toBe(0);
  });
});