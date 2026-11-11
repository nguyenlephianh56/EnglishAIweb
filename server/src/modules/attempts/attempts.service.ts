import { ExerciseStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { gradeExercise } from "../grading/gradeExercise";
import { buildAttemptResult } from "./attempt-result";
import {
  buildAttemptDetail,
  isAnswerRevealed,
  type AttemptDetail,
} from "./attempts-detail";
import type { CreateAttemptInput, ListAttemptsQuery } from "./attempts.schema";
import {
  buildAttemptListResponse,
  hasHistoryFilter,
  toAttemptListItem,
  type AttemptListResponse,
} from "./attempt-list";
import { MAX_ATTEMPTS_PER_ASSIGNMENT } from "./attempts.constants";

// Lỗi nghiệp vụ theo khuôn chung (statusCode + code); controller đổi thành response chuẩn.
const businessError = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
) => Object.assign(new Error(message), { statusCode, code, details });

// Chỉ lấy đúng các field cần để chấm và dựng kết quả.
const EXERCISE_FOR_ATTEMPT_SELECT = {
  id: true,
  type: true,
  skill: true,
  level: true,
  topic: true,
  content: true,
  answer: true,
  explanation: true,
} as const;

type ExerciseForAttempt = Prisma.ExerciseGetPayload<{
  select: typeof EXERCISE_FOR_ATTEMPT_SELECT;
}>;

/** Kết quả của bước "tìm bài + kiểm quyền": bài cần chấm và thông tin bài giao (nếu có). */
interface ResolvedTarget {
  exercise: ExerciseForAttempt;
  assignment: { id: number; dueAt: Date } | null;
}

/** Nhánh TỰ LUYỆN: bài phải PUBLISHED + in_library, nếu không -> 404. */
const resolvePracticeTarget = async (
  input: CreateAttemptInput
): Promise<ResolvedTarget> => {
  const exercise = await prisma.exercise.findFirst({
    where: {
      id: input.exerciseId,
      status: ExerciseStatus.PUBLISHED,
      inLibrary: true,
    },
    select: EXERCISE_FOR_ATTEMPT_SELECT,
  });

  if (!exercise) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy bài tập");
  }
  return { exercise, assignment: null };
};

/**
 * Chặn nếu HS đã dùng hết lượt nộp của bài giao này (409 ATTEMPT_LIMIT_REACHED).
 * Đếm MỌI dòng attempts của (student_id, assignment_id), kể cả nộp trễ hạn.
 * Gọi TRƯỚC khi chấm, nên lần nộp bị từ chối không bị chấm và không lưu dòng mới.
 * Đây mới là kiểm tra nhanh (chưa có khóa); bước sau sẽ đếm lại trong transaction.
 */
const assertAttemptsLeft = async (
  db: Pick<typeof prisma, "attempt">,
  studentId: number,
  assignmentId: number
): Promise<number> => {
  const used = await db.attempt.count({ where: { studentId, assignmentId } });
  if (used >= MAX_ATTEMPTS_PER_ASSIGNMENT) {
    throw businessError(
      409,
      "ATTEMPT_LIMIT_REACHED",
      `Bạn đã dùng hết ${MAX_ATTEMPTS_PER_ASSIGNMENT} lần nộp cho bài này`,
      { attemptsUsed: used, max: MAX_ATTEMPTS_PER_ASSIGNMENT }
    );
  }
  return used;
};

/**
 * Nhánh BÀI GIAO. Thứ tự (lỗi ở bước nào thì dừng):
 *  1. Assignment phải tồn tại VÀ HS phải là thành viên lớp của nó.
 *     Hai trường hợp dùng chung MỘT lỗi 404 để không lộ assignment của lớp khác.
 *  2. exerciseId (nếu body có) phải khớp assignment.exercise_id, sai -> 400.
 *  3. Bài lấy theo assignment: KHÔNG bắt buộc PUBLISHED/in_library; chỉ chặn HIDDEN (404).
 */
const resolveAssignmentTarget = async (
  user: { id: number },
  assignmentId: number,
  exerciseIdFromBody: number | undefined
): Promise<ResolvedTarget> => {
  const notFound = () =>
    businessError(404, "NOT_FOUND", "Không tìm thấy bài giao");

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, classId: true, exerciseId: true, dueAt: true },
  });
  if (!assignment) throw notFound();

  const membership = await prisma.classMember.findUnique({
    where: {
      classId_studentId: { classId: assignment.classId, studentId: user.id },
    },
    select: { studentId: true },
  });
  if (!membership) throw notFound();

  if (
    exerciseIdFromBody !== undefined &&
    exerciseIdFromBody !== assignment.exerciseId
  ) {
    throw businessError(
      400,
      "VALIDATION_ERROR",
      "exerciseId: Không khớp với bài của bài giao này"
    );
  }

  const exercise = await prisma.exercise.findFirst({
    where: {
      id: assignment.exerciseId,
      status: { not: ExerciseStatus.HIDDEN },
    },
    select: EXERCISE_FOR_ATTEMPT_SELECT,
  });
  if (!exercise) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy bài tập");
  }

  return {
    exercise,
    assignment: { id: assignment.id, dueAt: assignment.dueAt },
  };
};

/**
 * POST /api/v1/attempts: nộp bài. Có assignmentId -> bài giao, không có -> tự luyện.
 *
 * Thứ tự (lỗi ở bước nào thì dừng, KHÔNG tạo attempt):
 *  1. Tìm bài + kiểm quyền (hai nhánh ở trên).
 *  2. Chấm bằng gradeExercise: dạng không chấm tự động -> 422, bài làm sai hình dạng -> 400.
 *  3. Lưu 1 dòng attempts.
 *  4. Dựng kết quả: tự luyện lộ đáp án ngay; bài giao che đáp án (4c.4).
 *
 * studentId lấy từ JWT (user.id); input không có studentId/score/errors/is_late/submitted_at.
 *
 * Thời gian: lấy `now` MỘT LẦN bằng giờ server (không tin client). Cùng một `now` dùng cho
 * submitted_at, is_late (= now > dueAt, đúng hạn chót thì chưa trễ) và reveal.
 * Nộp trễ vẫn được chấm và lưu, chỉ đánh dấu is_late = true. Tự luyện luôn is_late = false.
 *
 * Lộ đáp án (4c.4): tự luyện lộ ngay; bài giao chỉ lộ khi đã quá hạn (now > dueAt).
 * Chưa quá hạn -> response không có answer/explanation/errors[].correction.
 */
export const submitAttempt = async (
  user: { id: number },
  input: CreateAttemptInput
) => {
  const { exercise, assignment } =
    input.assignmentId === undefined
      ? await resolvePracticeTarget(input)
      : await resolveAssignmentTarget(user, input.assignmentId, input.exerciseId);

  // Bài giao: hết lượt thì dừng ngay, chưa chấm, chưa lưu gì.
   if (assignment !== null) {
    await assertAttemptsLeft(prisma, user.id, assignment.id);
  }

  // Một mốc thời gian duy nhất cho cả lần nộp (giờ server).
  const now = new Date();
  // Đã quá hạn nộp? Tự luyện không có hạn nên luôn false.
  const pastDue =
    assignment !== null && now.getTime() > assignment.dueAt.getTime();
  const isLate = pastDue;

  // Ném lỗi có statusCode + code (422 NOT_AUTO_GRADABLE, 400 VALIDATION_ERROR, ...)
  const grade = gradeExercise(
    exercise.type,
    exercise.content,
    exercise.answer,
    input.answer
  );

  const { attempt, usedBefore } = await prisma.$transaction(async (tx) => {
    let usedBefore = 0;
    if (assignment !== null) {
      // ::int bắt buộc để Postgres chọn đúng hàm pg_advisory_xact_lock(int, int).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${user.id}::int, ${assignment.id}::int)`;
      usedBefore = await assertAttemptsLeft(tx, user.id, assignment.id);
    }

    const attempt = await tx.attempt.create({
      data: {
        studentId: user.id,
        exerciseId: exercise.id,
        assignmentId: assignment ? assignment.id : null,
        mode: input.mode,
        answer: input.answer as Prisma.InputJsonValue,
        score: grade.score,
        maxScore: grade.maxScore,
        errors: grade.errors as unknown as Prisma.InputJsonValue,
        isLate,
        submittedAt: now,
      },
      select: { id: true, score: true, maxScore: true, errors: true },
    });
    return { attempt, usedBefore };
  });

  // Tự luyện (assignment === null): lộ ngay. Bài giao: chỉ lộ khi đã quá hạn.
  const reveal = assignment === null || pastDue;
  const result = buildAttemptResult(attempt, exercise, { reveal });

  // Tự luyện không giới hạn nên response giữ nguyên. Bài giao thêm lượt nộp:
  // attemptNo = lần thứ mấy (1..tối đa), attemptsLeft = còn mấy lần.
  if (assignment === null) return result;
  const attemptNo = usedBefore + 1;
  return {
    ...result,
    attemptNo,
    attemptsLeft: MAX_ATTEMPTS_PER_ASSIGNMENT - attemptNo,
  };
};

/**
 * Số thứ tự lần nộp (attemptNo) của các lần nộp `attemptIds` thuộc HS `studentId`.
 * ROW_NUMBER() chạy trên TOÀN BỘ lần nộp của HS trong cùng nhóm (cùng assignment_id;
 * tự luyện: cùng exercise_id), xếp theo submitted_at rồi id, nên số thứ tự không đổi
 * theo bộ lọc hay trang. Không thêm cột, không sửa DB. Dùng chung cho danh sách và chi tiết.
 */
const loadAttemptNumbers = async (
  studentId: number,
  attemptIds: number[]
): Promise<Map<number, number>> => {
  const result = new Map<number, number>();
  if (attemptIds.length === 0) return result; // Prisma.join không nhận mảng rỗng

  const numbered = await prisma.$queryRaw<{ id: number; attempt_no: number }[]>(
    Prisma.sql`
      SELECT t.id, t.attempt_no
      FROM (
        SELECT a.id,
               ROW_NUMBER() OVER (
                 PARTITION BY a.assignment_id,
                              CASE WHEN a.assignment_id IS NULL THEN a.exercise_id END
                 ORDER BY a.submitted_at, a.id
               )::int AS attempt_no
        FROM attempts a
        WHERE a.student_id = ${studentId}
      ) t
      WHERE t.id IN (${Prisma.join(attemptIds)})
    `
  );
  for (const item of numbered) result.set(item.id, item.attempt_no);
  return result;
};

/**
 * GET /api/v1/attempts: lịch sử nộp bài CỦA CHÍNH HS đang đăng nhập.
 *
 * - student_id luôn lấy từ JWT (user.id); query không có cách nào đổi nó.
 * - Sắp xếp submitted_at giảm dần (id giảm dần để ổn định khi trùng giờ).
 * - total / bestScore / attemptsCount tính trên TOÀN BỘ kết quả khớp lọc bằng MỘT câu SQL
 *   tổng hợp (không phụ thuộc trang hiện tại). bestScore dùng COALESCE(teacher_score, score).
 * - attemptNo tính bằng ROW_NUMBER() trên TOÀN BỘ lần nộp của HS trong cùng nhóm
 *   (cùng assignment_id; tự luyện: cùng exercise_id), xếp theo submitted_at, id.
 *   Tính trước khi lọc/phân trang nên số thứ tự không đổi theo bộ lọc hay trang.
 *   Không thêm cột, không sửa DB.
 * - Không trả answer đúng / explanation / errors / bài làm: xem toAttemptListItem.
 */
export const listAttempts = async (
  user: { id: number },
  query: ListAttemptsQuery
): Promise<AttemptListResponse> => {
  const { assignmentId, exerciseId, mode, page, limit } = query;

  // Điều kiện lọc cho Prisma (findMany) ...
  const where: Prisma.AttemptWhereInput = {
    studentId: user.id,
    assignmentId,
    exerciseId,
    mode,
  };

  // ... và cùng điều kiện đó cho SQL tổng hợp. Giá trị luôn đi qua tham số (${...}),
  // không nối chuỗi nên không có SQL injection.
  const conditions: Prisma.Sql[] = [Prisma.sql`student_id = ${user.id}`];
  if (assignmentId !== undefined) {
    conditions.push(Prisma.sql`assignment_id = ${assignmentId}`);
  }
  if (exerciseId !== undefined) {
    conditions.push(Prisma.sql`exercise_id = ${exerciseId}`);
  }
  if (mode !== undefined) {
    conditions.push(Prisma.sql`mode = ${mode}`);
  }

  const [aggregate, rows] = await Promise.all([
    prisma.$queryRaw<{ total: number; best: number | null }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total,
             MAX(COALESCE(teacher_score, score)) AS best
      FROM attempts
      WHERE ${Prisma.join(conditions, " AND ")}
    `),
    prisma.attempt.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        exerciseId: true,
        assignmentId: true,
        mode: true,
        score: true,
        maxScore: true,
        teacherScore: true,
        isLate: true,
        submittedAt: true,
      },
    }),
  ]);

  // Số thứ tự lần nộp cho đúng các dòng của trang này.
  const attemptNoById = await loadAttemptNumbers(
    user.id,
    rows.map((row) => row.id)
  );

  const { total, best } = aggregate[0] ?? { total: 0, best: null };

  return buildAttemptListResponse({
    items: rows.map((row) =>
      toAttemptListItem(row, attemptNoById.get(row.id) ?? 1)
    ),
    page,
    limit,
    total,
    best,
    filtered: hasHistoryFilter(query),
  });
};


/**
 * GET /api/v1/attempts/:id: chi tiết MỘT lần nộp của CHÍNH HS đang đăng nhập.
 *
 * - Tìm theo (id, student_id từ JWT): bài nộp của HS khác và bài nộp không tồn tại cho
 *   CÙNG một lỗi 404, nên không ai dò được id của người khác.
 * - Kết quả dựng bằng buildAttemptResult (hàm dùng chung với POST), không viết lại logic lộ.
 * - Lộ đáp án (4c.4): tự luyện lộ ngay; bài giao chỉ lộ khi now > due_at. Chưa lộ thì
 *   response không có answer / explanation / correction (do buildAttemptResult lo).
 * - Bài làm của HS trả ở `submittedAnswer` (key `answer` dành cho đáp án đúng).
 * - `now` là giờ server, lấy một lần.
 */
export const getAttemptDetail = async (
  user: { id: number },
  attemptId: number
): Promise<AttemptDetail> => {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, studentId: user.id },
    select: {
      id: true,
      exerciseId: true,
      assignmentId: true,
      mode: true,
      answer: true,
      score: true,
      maxScore: true,
      errors: true,
      teacherScore: true,
      teacherComment: true,
      isLate: true,
      submittedAt: true,
      assignment: { select: { dueAt: true } },
      exercise: { select: EXERCISE_FOR_ATTEMPT_SELECT },
    },
  });

  if (!attempt) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy bài nộp");
  }

  const now = new Date();
  const reveal = isAnswerRevealed(
    attempt.assignmentId,
    attempt.assignment ? attempt.assignment.dueAt : null,
    now
  );
  const result = buildAttemptResult(attempt, attempt.exercise, { reveal });

  const numbers = await loadAttemptNumbers(user.id, [attempt.id]);
  return buildAttemptDetail({
    attempt,
    result,
    attemptNo: numbers.get(attempt.id) ?? 1,
  });
};