import { ExerciseStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { gradeExercise } from "../grading/gradeExercise";
import { buildAttemptResult } from "./attempt-result";
import {buildAttemptDetail,isAnswerRevealed,isPastDue,type AttemptDetail,} from "./attempts-detail";
import {writingAnswerSchema,type CreateAttemptInput,type ListAttemptsQuery,} from "./attempts.schema";
import {buildAttemptListResponse,hasHistoryFilter,toAttemptListItem,type AttemptListResponse,} from "./attempt-list";
import {MAX_ATTEMPTS_PER_ASSIGNMENT,WRITING_MAX_SCORE,} from "./attempts.constants";
import { gradeWritingAttempt, type WritingGradeSaved } from "./attempts-writing-grade";
import type { AiRole } from "../../ai/ai.usage";
import { env } from "../../config/env";
import { validateWritingLength } from "../grading/writingLength";
import { toGradingError, type GradingError } from "./attempts-grading-error";
import { refreshProfileAfterGrading } from "../skill-profiles/skill-profiles.refresh";

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
export interface ResolvedTarget {
  exercise: ExerciseForAttempt;
  assignment: { id: number; dueAt: Date } | null;
}

/** Nhánh TỰ LUYỆN: bài phải PUBLISHED + in_library, nếu không -> 404. */
const resolvePracticeTarget = async (
   input: Pick<CreateAttemptInput, "exerciseId">
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
 * Bước chung "tìm bài + kiểm quyền + kiểm lượt" của MỌI lần nộp (POST /attempts và upload âm thanh).
 * Giữ đúng thứ tự cũ của submitAttempt: tìm bài/kiểm quyền (tự luyện hoặc bài giao) -> với bài giao
 * thì kiểm còn lượt (409). Chưa chấm, chưa lưu gì. Dùng chung để KHÔNG có bản thứ hai lệch quy tắc.
 * Lỗi ném ra có statusCode + code như cũ (404 NOT_FOUND, 400 VALIDATION_ERROR, 409 ATTEMPT_LIMIT_REACHED).
 *
 * Chốt an toàn: thiếu cả hai mã -> 400. Với POST /attempts, Zod đã chặn ca này từ trước nên
 * nhánh này không bao giờ chạy; nó chỉ để nơi gọi khác không vô tình lọt vào nhánh tự luyện
 * với exerciseId = undefined (Prisma sẽ bỏ điều kiện id và khớp một bài bất kỳ).
 */
export const resolveSubmitTarget = async (
  user: { id: number },
  input: Pick<CreateAttemptInput, "exerciseId" | "assignmentId">
): Promise<ResolvedTarget> => {
  if (input.assignmentId === undefined && input.exerciseId === undefined) {
    throw businessError(
      400,
      "VALIDATION_ERROR",
      "exerciseId: Mã bài tập là bắt buộc"
    );
  }

  const target =
    input.assignmentId === undefined
      ? await resolvePracticeTarget(input)
      : await resolveAssignmentTarget(user, input.assignmentId, input.exerciseId);

  // Bài giao: hết lượt thì dừng ngay.
  if (target.assignment !== null) {
    await assertAttemptsLeft(prisma, user.id, target.assignment.id);
  }
  return target;
};

/** Điều sẽ lưu vào attempts cho một lần nộp: bài làm đã chuẩn hóa + điểm + lỗi. */
interface PreparedAttempt {
  answer: unknown;
  score: number | null;
  maxScore: number;
  errors: unknown[];
}

/** minWords của đề, lấy từ exercises.content trong DB (không nhận từ client). Thiếu/sai -> 0. */
const readMinWords = (content: unknown): number => {
  const raw =
    typeof content === "object" && content !== null
      ? (content as Record<string, unknown>).minWords
      : undefined;
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 0;
};

/**
 * Dạng writing: chỉ kiểm hình dạng { text } rồi lưu CHỜ CHẤM (score = NULL, errors = []).
 * ai_feedback không đặt nên là NULL. Chấm AI làm ở dòng sau của T13.
 * Lỗi 400 chỉ nêu field sai, không chép lại nội dung bài viết.
 */
const prepareWritingAttempt = (
  studentAnswer: unknown,
  content: unknown
): PreparedAttempt => {
  const parsed = writingAnswerSchema.safeParse(studentAnswer);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join("; ");
    throw businessError(400, "VALIDATION_ERROR", `Bài làm không hợp lệ: ${detail}`);
  }

  // Kiểm độ dài TRƯỚC khi lưu attempt và TRƯỚC khi gọi AI (tiết kiệm lượt).
  // Chỉ có số liệu trong details, không chép lại nội dung bài viết.
  const length = validateWritingLength(parsed.data.text, readMinWords(content), {
    maxWords: env.WRITING_MAX_WORDS,
    maxChars: env.WRITING_MAX_CHARS,
  });
  if (!length.ok) {
    const details =
      length.code === "WRITING_TOO_SHORT"
        ? { wordCount: length.wordCount, minWords: length.minWords }
        : {
            wordCount: length.wordCount,
            charCount: length.charCount,
            maxWords: length.maxWords,
            maxChars: length.maxChars,
          };
    throw businessError(400, length.code, length.message, details);
  }

  return {
    answer: parsed.data,
    score: null,
    maxScore: WRITING_MAX_SCORE,
    errors: [],
  };
};

/** 6 dạng chấm tự động qua registry; writing lưu chờ chấm; speaking vẫn 422 (Sprint 4). */
const prepareAttempt = (
  exercise: ExerciseForAttempt,
  studentAnswer: unknown
): PreparedAttempt => {
  if (exercise.type === "writing") {
  return prepareWritingAttempt(studentAnswer, exercise.content);
}

  const grade = gradeExercise(
    exercise.type,
    exercise.content,
    exercise.answer,
    studentAnswer
  );
  return {
    answer: studentAnswer,
    score: grade.score,
    maxScore: grade.maxScore,
    errors: grade.errors,
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
  user: { id: number; role: AiRole },
  input: CreateAttemptInput
) => {
    // Tìm bài + kiểm quyền + kiểm còn lượt (hàm dùng chung với upload âm thanh).
  // Lỗi ở bước nào thì dừng, chưa chấm, chưa lưu gì.
  const { exercise, assignment } = await resolveSubmitTarget(user, input);
  // Một mốc thời gian duy nhất cho cả lần nộp (giờ server).
  const now = new Date();
  // Đã quá hạn nộp? Tự luyện không có hạn nên luôn false.
  const isLate = assignment !== null && isPastDue(assignment.dueAt, now);

  // Ném lỗi có statusCode + code (422 NOT_AUTO_GRADABLE, 400 VALIDATION_ERROR, ...)
 const prepared = prepareAttempt(exercise, input.answer);

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
       answer: prepared.answer as Prisma.InputJsonValue,
       score: prepared.score,
       maxScore: prepared.maxScore,
       errors: prepared.errors as unknown as Prisma.InputJsonValue,
        isLate,
        submittedAt: now,
      },
      select: { id: true, score: true, maxScore: true, errors: true },
    });
    return { attempt, usedBefore };
  });

  // Điểm tự động đã commit; lỗi hồ sơ được hàm refresh nuốt, không làm hỏng nộp bài.
  if (exercise.type !== "writing") {
    await refreshProfileAfterGrading(prisma, attempt.id);
  }

    // Writing: attempt đã lưu (score NULL) NGOÀI transaction, giờ mới gọi AI (chờ vài giây, không
  // giữ khóa/kết nối DB). Lỗi AI (hết lượt, bận, timeout, sai khuôn...) KHÔNG làm mất bài:
  // attempt giữ nguyên score = NULL (gradeWritingAttempt chỉ ghi SAU khi AI trả kết quả hợp lệ,
  // nên không có trạng thái nửa vời) và HS nhận phản hồi "đã lưu, chưa chấm". Lỗi không phải AI
  // (DB...) vẫn ném ra như cũ.
  let finalAttempt: typeof attempt & { aiFeedback?: unknown } = attempt;
  let gradingError: GradingError | null = null;
  if (exercise.type === "writing") {
    const { text } = prepared.answer as { text: string };
    try {
      const graded = await gradeWritingAttempt({
        attemptId: attempt.id,
        userId: user.id,
        role: user.role,
        text,
        exercise: { level: exercise.level, content: exercise.content },
      });
      if (graded.written === true) {
        await refreshProfileAfterGrading(prisma, attempt.id);
      }
      finalAttempt = {
        ...attempt,
        score: graded.score,
        errors: graded.errors as typeof attempt.errors,
        aiFeedback: graded.aiFeedback,
      };
    } catch (error) {
      gradingError = toGradingError(error);
      if (gradingError === null) throw error;
    }
  }

  // Tự luyện (assignment === null): lộ ngay. Bài giao: chỉ lộ khi đã quá hạn.
  // Cùng hàm với GET chi tiết và regrade; cùng `now` với is_late.
  const reveal = isAnswerRevealed(
    assignment ? assignment.id : null,
    assignment ? assignment.dueAt : null,
    now
  );
  const result = buildAttemptResult(finalAttempt, exercise, { reveal });

  // Tự luyện không giới hạn nên response giữ nguyên. Bài giao thêm lượt nộp:
  // attemptNo = lần thứ mấy (1..tối đa), attemptsLeft = còn mấy lần.
  const body =
    assignment === null
      ? result
      : {
          ...result,
          attemptNo: usedBefore + 1,
          attemptsLeft: MAX_ATTEMPTS_PER_ASSIGNMENT - (usedBefore + 1),
        };

  // Chấm AI thất bại: bài ĐÃ lưu nên không phải lỗi nộp. Controller trả 202 cho dạng này.
  // attemptId nằm ở cả data.attemptId và data.attempt.attemptId; bài viết không có trong response.
  if (gradingError !== null) {
    return { attemptId: attempt.id, attempt: body, gradingError };
  }
  return body;
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
      aiFeedback: true,
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
/**
 * POST /api/v1/attempts/:id/regrade: chấm lại MỘT attempt writing đang chờ chấm (score IS NULL),
 * thường sau khi lần nộp trước bị lỗi AI (202 gradingError).
 *
 * Quy tắc:
 *  - Chỉ HS CHỦ attempt (lọc studentId = user.id): attempt của người khác/không tồn tại -> 404.
 *    GV/ADMIN đã bị route chặn 403 từ trước.
 *  - Chỉ dạng writing (khác -> 400 NOT_REGRADABLE) và chỉ khi score IS NULL (đã chấm -> 409
 *    ATTEMPT_ALREADY_GRADED). Không nhận body: nội dung bài lấy từ DB, không từ client.
 *  - Chấm lại CHÍNH dòng đó: không tạo dòng mới, không tốn lần nộp; is_late/submitted_at KHÔNG đổi
 *    (gradeWritingAttempt chỉ ghi score, ai_feedback, errors).
 *  - Vẫn qua gradeWriting -> runAiTask nên tính hạn mức ngày và ghi ai_usage_logs như thường.
 *  - Ghi bằng updateMany where id AND score IS NULL: hai request song song chỉ một lần ghi thắng;
 *    lần thua nhận 409 (không ghi đè).
 *  - Lỗi AI lại: attempt giữ nguyên, trả { attemptId, attempt, gradingError } (controller: 202).
 *  - Chấm lại sau due_at vẫn được; lộ đáp án theo 4c.4 tại thời điểm này (isAnswerRevealed).
 * Response không chứa bài viết, chỉ có kết quả + attemptNo/isLate/submittedAt.
 */
export const regradeAttempt = async (
  user: { id: number; role: AiRole },
  attemptId: number
) => {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, studentId: user.id },
    select: {
      id: true,
      assignmentId: true,
      answer: true,
      score: true,
      maxScore: true,
      errors: true,
      aiFeedback: true,
      teacherScore: true,
      isLate: true,
      submittedAt: true,
      assignment: { select: { dueAt: true } },
      exercise: { select: EXERCISE_FOR_ATTEMPT_SELECT },
    },
  });

  if (!attempt) {
    throw businessError(404, "NOT_FOUND", "Không tìm thấy bài nộp");
  }
  if (attempt.exercise.type !== "writing") {
    throw businessError(400, "NOT_REGRADABLE", "Chỉ bài Viết mới cần chấm lại");
  }
  if (attempt.score !== null) {
    throw businessError(409, "ATTEMPT_ALREADY_GRADED", "Bài này đã được chấm rồi");
  }

  // Bài viết lấy từ DB (đã qua writingAnswerSchema lúc nộp); kiểm lại để chắc chắn dữ liệu còn đúng khuôn.
  const parsed = writingAnswerSchema.safeParse(attempt.answer);
  if (!parsed.success) {
    throw businessError(422, "ATTEMPT_DATA_INVALID", "Bài nộp không có nội dung hợp lệ để chấm lại");
  }

  let graded: WritingGradeSaved | null = null;
  let gradingError: GradingError | null = null;
  try {
    graded = await gradeWritingAttempt({
      attemptId: attempt.id,
      userId: user.id,
      role: user.role,
      text: parsed.data.text,
      exercise: { level: attempt.exercise.level, content: attempt.exercise.content },
    });
  } catch (error) {
    gradingError = toGradingError(error);
    if (gradingError === null) throw error; // lỗi không phải AI (DB...) xử lý như cũ
  }

  // Có lần chấm khác ghi trước (bấm 2 lần/song song): không ghi đè, báo 409.
  if (graded !== null && !graded.written) {
    throw businessError(409, "ATTEMPT_ALREADY_GRADED", "Bài này vừa được chấm xong");
  }

    if (graded !== null && graded.written === true) {
    await refreshProfileAfterGrading(prisma, attempt.id);
  }
  

  const reveal = isAnswerRevealed(
    attempt.assignmentId,
    attempt.assignment ? attempt.assignment.dueAt : null,
    new Date()
  );
  const result = buildAttemptResult(
    {
      id: attempt.id,
      score: graded ? graded.score : attempt.score,
      maxScore: attempt.maxScore,
      errors: graded ? graded.errors : attempt.errors,
      aiFeedback: graded ? graded.aiFeedback : attempt.aiFeedback,
      teacherScore: attempt.teacherScore,
    },
    attempt.exercise,
    { reveal }
  );

  const numbers = await loadAttemptNumbers(user.id, [attempt.id]);
  const body = {
    ...result,
    attemptNo: numbers.get(attempt.id) ?? 1,
    // Chỉ bài giao có giới hạn lần nộp (4c.3); chấm lại không đổi con số này.
    ...(attempt.assignmentId !== null
      ? {
          attemptsLeft: Math.max(
            0,
            MAX_ATTEMPTS_PER_ASSIGNMENT -
              (await prisma.attempt.count({
                where: { studentId: user.id, assignmentId: attempt.assignmentId },
              }))
          ),
        }
      : {}),
    isLate: attempt.isLate,
    submittedAt: attempt.submittedAt,
  };

  if (gradingError !== null) {
    return { attemptId: attempt.id, attempt: body, gradingError };
  }
  return body;
};