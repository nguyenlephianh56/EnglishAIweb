import { ExerciseStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  NON_ASSIGNABLE_TYPES,
  type AssignmentStatus,
} from "./assignments.constants";
import type {
  CreateAssignmentInput,
  ListAssignmentsQuery,
} from "./assignments.schema";
import {
  buildPage,
  buildSubmissionsResponse,
  toStudentAssignmentDetail,
  toStudentAssignmentItem,
  toTeacherAssignmentItem,
  type Page,
  type StudentAssignmentDetail,
  type StudentAssignmentItem,
  type StudentAttemptStats,
  type SubmissionsResponse,
  type SubmissionStats,
  type TeacherAssignmentItem,
} from "./assignments-view";

// Lỗi nghiệp vụ theo khuôn chung (statusCode + code); controller đổi thành response chuẩn.
const businessError = (statusCode: number, code: string, message: string) =>
  Object.assign(new Error(message), { statusCode, code });

/**
 * POST /api/v1/assignments: GV giao bài cho MỘT lớp của mình.
 *
 * Thứ tự (lỗi ở bước nào thì dừng, KHÔNG tạo assignment):
 *  1. Lớp phải do GV này làm chủ. Lớp không tồn tại và lớp của GV khác cùng một lỗi 404,
 *     để không lộ lớp đó có tồn tại. (ADMIN đã bị requireRole chặn từ route.)
 *  2. Bài phải tồn tại VÀ (đã PUBLISHED, hoặc do chính GV này tạo và không HIDDEN).
 *     Không thỏa -> 404 (không lộ bài DRAFT của GV khác).
 *  3. Dạng bài phải cho giao (writing/speaking chặn tạm) -> 422.
 *
 * assigned_by_id lấy từ JWT (user.id), không nhận từ body.
 * Không chặn giao trùng (cùng bài, cùng lớp): GV có thể giao lại với hạn khác.
 */
export const createAssignment = async (
  user: { id: number },
  input: CreateAssignmentInput
) => {
  const ownClass = await prisma.class.findFirst({
    where: { id: input.classId, teacherId: user.id },
    select: { id: true },
  });
  if (!ownClass) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy lớp");
  }

  const exercise = await prisma.exercise.findFirst({
    where: {
      id: input.exerciseId,
      OR: [
        { status: ExerciseStatus.PUBLISHED },
        { createdById: user.id, status: { not: ExerciseStatus.HIDDEN } },
      ],
    },
    select: { id: true, type: true },
  });
  if (!exercise) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy bài tập");
  }

  if (NON_ASSIGNABLE_TYPES.includes(exercise.type)) {
    throw businessError(
      422,
      "TYPE_NOT_ASSIGNABLE",
      "Dạng bài này chưa hỗ trợ giao cho lớp"
    );
  }

  const created = await prisma.assignment.create({
    data: {
      exerciseId: exercise.id,
      classId: ownClass.id,
      assignedById: user.id,
      dueAt: input.dueAt,
      remindBeforeH: input.remindBeforeHours,
    },
    select: {
      id: true,
      exerciseId: true,
      classId: true,
      assignedById: true,
      dueAt: true,
      remindBeforeH: true,
      createdAt: true,
    },
  });

  // Danh sách trắng: đổi tên cột remindBeforeH thành remindBeforeHours cho khớp API.
  return {
    id: created.id,
    exerciseId: created.exerciseId,
    classId: created.classId,
    assignedById: created.assignedById,
    dueAt: created.dueAt,
    remindBeforeHours: created.remindBeforeH,
    createdAt: created.createdAt,
  };
};


// Chỉ lấy đúng các field cần cho danh sách (KHÔNG lấy content/answer/explanation).
const EXERCISE_BRIEF_SELECT = {
  id: true,
  type: true,
  skill: true,
  level: true,
  topic: true,
} as const;

/**
 * Điều kiện lọc theo status của MỘT HS, dịch sang điều kiện DB để phân trang đúng.
 * Ranh giới phải khớp computeStatus: OVERDUE là dueAt < now, NOT_STARTED là dueAt >= now.
 */
const statusFilter = (
  status: AssignmentStatus | undefined,
  studentId: number,
  now: Date
): Prisma.AssignmentWhereInput => {
  switch (status) {
    case "SUBMITTED":
      return { attempts: { some: { studentId } } };
    case "OVERDUE":
      return { dueAt: { lt: now }, attempts: { none: { studentId } } };
    case "NOT_STARTED":
      return { dueAt: { gte: now }, attempts: { none: { studentId } } };
    default:
      return {};
  }
};

/**
 * Số liệu attempts của MỘT HS cho nhiều bài giao, bằng MỘT câu SQL gộp (tránh N+1).
 * Bài giao chưa có attempt thì không có dòng trong kết quả (nơi dùng coi như 0 lần nộp).
 * Điểm cao nhất = MAX(COALESCE(teacher_score, score)): teacher_score = 0 vẫn ghi đè score.
 */
const loadStudentStats = async (
  studentId: number,
  assignmentIds: number[]
): Promise<Map<number, StudentAttemptStats>> => {
  const statsById = new Map<number, StudentAttemptStats>();
  if (assignmentIds.length === 0) return statsById; // Prisma.join không nhận mảng rỗng

  const stats = await prisma.$queryRaw<
    {
      assignmentId: number;
      attemptsUsed: number;
      best: number | null;
      late: boolean;
    }[]
  >(Prisma.sql`
    SELECT assignment_id AS "assignmentId",
           COUNT(*)::int AS "attemptsUsed",
           MAX(COALESCE(teacher_score, score)) AS "best",
           BOOL_OR(is_late) AS "late"
    FROM attempts
    WHERE student_id = ${studentId}
      AND assignment_id IN (${Prisma.join(assignmentIds)})
    GROUP BY assignment_id
  `);
  for (const item of stats) {
    statsById.set(item.assignmentId, {
      attemptsUsed: item.attemptsUsed,
      best: item.best,
      late: item.late,
    });
  }
  return statsById;
};

/**
 * GET /assignments cho HỌC SINH: bài giao thuộc các lớp HS là thành viên.
 *
 * - student_id lấy từ JWT. Bài mà exercise đã bị HIDDEN thì ẩn (T4 cũng không cho nộp).
 * - Sắp xếp due_at tăng dần (id tăng dần để ổn định khi trùng giờ).
 * - Tránh N+1: 1 truy vấn bài giao (kèm exercise, class) + 1 count + 1 SQL gộp theo
 *   assignment_id cho số lần nộp / điểm cao nhất / cờ trễ của cả trang.
 *   Điểm cao nhất = MAX(COALESCE(teacher_score, score)): teacher_score = 0 vẫn ghi đè score.
 */
const listForStudent = async (
  user: { id: number },
  query: ListAssignmentsQuery
): Promise<Page<StudentAssignmentItem>> => {
  const { status, classId, page, limit } = query;
  const now = new Date();

  const where: Prisma.AssignmentWhereInput = {
    class: { members: { some: { studentId: user.id } } },
    exercise: { status: { not: ExerciseStatus.HIDDEN } },
    ...(classId !== undefined ? { classId } : {}),
    ...statusFilter(status, user.id, now),
  };

  const [total, rows] = await Promise.all([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({
      where,
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        dueAt: true,
        exercise: { select: EXERCISE_BRIEF_SELECT },
        class: { select: { id: true, name: true } },
      },
    }),
  ]);

  const statsById = await loadStudentStats(
    user.id,
    rows.map((row) => row.id)
  );

  return buildPage(
    rows.map((row) => toStudentAssignmentItem(row, statsById.get(row.id), now)),
    page,
    limit,
    total
  );
};

/**
 * GET /assignments cho GIÁO VIÊN: bài giao thuộc các lớp CỦA MÌNH (class.teacher_id = user.id).
 *
 * - Lọc classId của lớp người khác không lỗi và không lộ gì: kết quả đơn giản là rỗng.
 * - Sắp xếp due_at giảm dần (bài mới/hạn xa lên đầu), id giảm dần để ổn định.
 * - submittedCount = số HS KHÁC NHAU đã nộp, chỉ tính HS còn trong lớp (JOIN class_members).
 *   totalStudents = số thành viên hiện tại của lớp. Hai số này cùng một mốc nên so sánh được.
 * - status không áp dụng cho GV (là trạng thái của từng HS) nên bị bỏ qua.
 */
const listForTeacher = async (
  user: { id: number },
  query: ListAssignmentsQuery
): Promise<Page<TeacherAssignmentItem>> => {
  const { classId, page, limit } = query;

  const where: Prisma.AssignmentWhereInput = {
    class: { teacherId: user.id },
    ...(classId !== undefined ? { classId } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({
      where,
      orderBy: [{ dueAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        dueAt: true,
        remindBeforeH: true,
        createdAt: true,
        exercise: { select: EXERCISE_BRIEF_SELECT },
        class: {
          select: { id: true, name: true, _count: { select: { members: true } } },
        },
      },
    }),
  ]);

  const submittedById = new Map<number, number>();
  if (rows.length > 0) {
    const counts = await prisma.$queryRaw<
      { assignmentId: number; submitted: number }[]
    >(Prisma.sql`
      SELECT a.assignment_id AS "assignmentId",
             COUNT(DISTINCT a.student_id)::int AS "submitted"
      FROM attempts a
      JOIN assignments s ON s.id = a.assignment_id
      JOIN class_members cm
        ON cm.class_id = s.class_id AND cm.student_id = a.student_id
      WHERE a.assignment_id IN (${Prisma.join(rows.map((row) => row.id))})
      GROUP BY a.assignment_id
    `);
    for (const item of counts) {
      submittedById.set(item.assignmentId, item.submitted);
    }
  }

  return buildPage(
    rows.map((row) => toTeacherAssignmentItem(row, submittedById.get(row.id) ?? 0)),
    page,
    limit,
    total
  );
};

/**
 * GET /api/v1/assignments: danh sách bài giao theo vai trò.
 * HS: bài được giao cho lớp mình (kèm status). GV: bài đã giao ở lớp mình (kèm số HS đã nộp).
 * ADMIN đã bị requireRole chặn từ route.
 */
export const listAssignments = async (
  user: { id: number; role: Role },
  query: ListAssignmentsQuery
): Promise<Page<StudentAssignmentItem> | Page<TeacherAssignmentItem>> => {
  if (user.role === Role.STUDENT) return listForStudent(user, query);
  if (user.role === Role.TEACHER) return listForTeacher(user, query);
  throw businessError(403, "FORBIDDEN", "Bạn không có quyền truy cập chức năng này");
};


/**
 * GET /api/v1/assignments/:id: chi tiết bài giao + đề để làm bài, cho HS là thành viên lớp.
 *
 * - Bài giao không tồn tại, của lớp HS không thuộc, hoặc exercise đã HIDDEN: cùng MỘT lỗi 404,
 *   để không ai dò được id bài giao của lớp khác.
 * - Chỉ select các field của đề cần để làm bài (KHÔNG select answer); toStudentView là lớp chặn thứ hai.
 * - explanation chỉ có khi now > due_at (4c.4). `now` là giờ server, lấy một lần.
 */
export const getAssignmentDetail = async (
  user: { id: number },
  assignmentId: number
): Promise<StudentAssignmentDetail> => {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      class: { members: { some: { studentId: user.id } } },
      exercise: { status: { not: ExerciseStatus.HIDDEN } },
    },
    select: {
      id: true,
      dueAt: true,
      exercise: {
        select: { ...EXERCISE_BRIEF_SELECT, content: true, explanation: true },
      },
      class: { select: { id: true, name: true } },
    },
  });
  if (!assignment) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy bài giao");
  }

  const now = new Date();
  const stats = await loadStudentStats(user.id, [assignment.id]);
  return toStudentAssignmentDetail(assignment, stats.get(assignment.id), now);
};


/**
 * GET /api/v1/assignments/:id/submissions: bài nộp của cả lớp, cho GV CHỦ LỚP.
 *
 * - Bài giao không tồn tại và bài giao của lớp GV khác cùng một lỗi 404.
 *   (ADMIN đã bị requireRole chặn từ route.)
 * - Trả MỌI HS hiện có trong lớp (kể cả chưa làm); HS đã rời lớp không có dòng.
 * - Tránh N+1: 1 truy vấn bài giao, 1 truy vấn thành viên lớp (chỉ id/name/email,
 *   KHÔNG lấy passwordHash), 1 SQL gộp theo HS.
 * - Điểm cao nhất = MAX(COALESCE(teacher_score, score)). bestAttemptId = lần đạt điểm đó
 *   (DISTINCT ON; hòa điểm lấy lần sớm nhất; điểm null xếp cuối).
 * - JOIN class_members để attempt của người không còn trong lớp không bị tính.
 */
export const getSubmissions = async (
  user: { id: number },
  assignmentId: number
): Promise<SubmissionsResponse> => {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, class: { teacherId: user.id } },
    select: {
      id: true,
      classId: true,
      dueAt: true,
      exercise: { select: EXERCISE_BRIEF_SELECT },
      class: { select: { id: true, name: true } },
    },
  });
  if (!assignment) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy bài giao");
  }

  const now = new Date();

  const [members, statRows] = await Promise.all([
    prisma.classMember.findMany({
      where: { classId: assignment.classId },
      orderBy: [{ student: { name: "asc" } }, { studentId: "asc" }],
      select: { student: { select: { id: true, name: true, email: true } } },
    }),
    prisma.$queryRaw<
      {
        studentId: number;
        attemptsUsed: number;
        late: boolean;
        lastSubmittedAt: Date;
        best: number | null;
        bestAttemptId: number;
      }[]
    >(Prisma.sql`
      WITH scoped AS (
        SELECT a.id, a.student_id, a.is_late, a.submitted_at,
               COALESCE(a.teacher_score, a.score) AS final
        FROM attempts a
        JOIN class_members cm
          ON cm.class_id = ${assignment.classId} AND cm.student_id = a.student_id
        WHERE a.assignment_id = ${assignment.id}
      ),
      best AS (
        SELECT DISTINCT ON (student_id) student_id, id AS best_attempt_id, final
        FROM scoped
        ORDER BY student_id, final DESC NULLS LAST, submitted_at ASC, id ASC
      ),
      agg AS (
        SELECT student_id,
               COUNT(*)::int AS attempts_used,
               BOOL_OR(is_late) AS late,
               MAX(submitted_at) AS last_submitted_at
        FROM scoped
        GROUP BY student_id
      )
      SELECT agg.student_id AS "studentId",
             agg.attempts_used AS "attemptsUsed",
             agg.late AS "late",
             agg.last_submitted_at AS "lastSubmittedAt",
             best.final AS "best",
             best.best_attempt_id AS "bestAttemptId"
      FROM agg
      JOIN best ON best.student_id = agg.student_id
    `),
  ]);

  const statsByStudent = new Map<number, SubmissionStats>();
  for (const row of statRows) {
    statsByStudent.set(row.studentId, {
      attemptsUsed: row.attemptsUsed,
      best: row.best,
      bestAttemptId: row.bestAttemptId,
      late: row.late,
      lastSubmittedAt: row.lastSubmittedAt,
    });
  }

  return buildSubmissionsResponse(
    assignment,
    members.map((member) => member.student),
    statsByStudent,
    now
  );
};