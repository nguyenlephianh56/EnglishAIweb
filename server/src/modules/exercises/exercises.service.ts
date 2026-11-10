import {
  ExerciseSource,
  ExerciseStatus,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import { isDeepStrictEqual } from "node:util";
import { SKILL_BY_TYPE } from "./exercises.schema";
import type {
  CreateExerciseInput,
  UpdateExerciseInput,
} from "./exercises.schema";
import type { ExerciseType } from "./exercise-content.schema";
import { validateExercise } from "./validate-exercise";
import {
  EXERCISE_VALIDATION_ERROR_CODE,
  formatValidationErrors,
} from "./exercise-errors";
import { toStudentView } from "./exercise-view";

// Người dùng hiện tại (lấy từ req.user do middleware authenticate gắn vào)
interface CurrentUser {
  id: number;
  role: Role;
  status: UserStatus;
}

// Lỗi nghiệp vụ: controller sẽ đổi thành response { data: null, error } (giống module classes)
const businessError = (statusCode: number, code: string, message: string) =>
  Object.assign(new Error(message), { statusCode, code });

// Chỉ trả đúng các field này cho client (không trả field thừa).
// Người tạo được xem đáp án nên có đủ content/answer/explanation.
const EXERCISE_SELECT = {
  id: true,
  type: true,
  skill: true,
  level: true,
  topic: true,
  content: true,
  answer: true,
  explanation: true,
  status: true,
  source: true,
  inLibrary: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

// POST /api/v1/exercises
// Quy tắc đặt giá trị (SERVER tự quyết, không lấy từ body):
//   TEACHER: source=TEACHER, status=DRAFT, inLibrary=false (publish bị bỏ qua)
//   ADMIN:   source=ADMIN,   status=DRAFT, inLibrary=false
//            nếu publish=true -> status=PUBLISHED, inLibrary=true
export const createExercise = async (
  user: CurrentUser,
  input: CreateExerciseInput
) => {
  // Phòng thủ: route đã có requireRole + authenticate, nhưng service vẫn tự kiểm
  // để lỡ ai đó gọi hàm này từ chỗ khác cũng không vượt quyền được.
  if (user.role !== Role.TEACHER && user.role !== Role.ADMIN) {
    throw businessError(
      403,
      "FORBIDDEN",
      "Bạn không có quyền truy cập chức năng này"
    );
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw businessError(
      403,
      "FORBIDDEN",
      "Tài khoản chưa được kích hoạt hoặc đã bị khóa"
    );
  }

  // Kiểm tra content/answer bằng T1 (gồm kiểm tra chéo). Sai -> 400 kèm đường dẫn field.
  const validated = validateExercise(input.type, input.content, input.answer);

  if (!validated.success) {
    throw businessError(
      400,
      EXERCISE_VALIDATION_ERROR_CODE,
      formatValidationErrors(validated.errors)
    );
  }

  const isAdmin = user.role === Role.ADMIN;
  const publishNow = isAdmin && input.publish === true;

  const { content, answer } = validated.data;

  return prisma.exercise.create({
    data: {
      type: input.type,
      skill: input.skill,
      level: input.level,
      topic: input.topic,
      // Dùng bản content/answer đã được T1 trim và chuẩn hóa
      content: content as Prisma.InputJsonValue,
      // writing/speaking: lưu NULL của SQL (Prisma.DbNull), KHÔNG phải JSON "null"
      answer:
        answer === null || answer === undefined
          ? Prisma.DbNull
          : (answer as Prisma.InputJsonValue),
      explanation: input.explanation,
      source: isAdmin ? ExerciseSource.ADMIN : ExerciseSource.TEACHER,
      status: publishNow ? ExerciseStatus.PUBLISHED : ExerciseStatus.DRAFT,
      inLibrary: publishNow,
      createdById: user.id,
    },
    select: EXERCISE_SELECT,
  });
};

// ---------------------------------------------------------------------------
// GET /api/v1/exercises/:id
// ---------------------------------------------------------------------------

// Bài không tồn tại và bài không có quyền xem dùng CHUNG một lỗi 404,
// để người ngoài không dò được "bài id này có tồn tại hay không".
const exerciseNotFound = () =>
  businessError(404, "NOT_FOUND", "Không tìm thấy bài tập");

// Bài thuộc thư viện chung (quy tắc 4b): PUBLISHED và in_library = true
const isLibraryExercise = (exercise: {
  status: ExerciseStatus;
  inLibrary: boolean;
}) => exercise.status === ExerciseStatus.PUBLISHED && exercise.inLibrary;

/**
 * Ai được xem bài nào:
 *  - ADMIN: mọi bài.
 *  - TEACHER: bài do mình tạo (mọi trạng thái, kể cả HIDDEN) + bài thư viện của người khác (xem thử).
 *  - STUDENT: chỉ bài thư viện. (Bài trong bài giao của lớp làm ở T5.)
 * Bài HIDDEN có in_library = false nên tự động chỉ chủ bài/admin thấy.
 */
export const canViewExercise = (
  user: CurrentUser,
  exercise: { createdById: number; status: ExerciseStatus; inLibrary: boolean }
): boolean => {
  switch (user.role) {
    case Role.ADMIN:
      return true;
    case Role.TEACHER:
      return exercise.createdById === user.id || isLibraryExercise(exercise);
    case Role.STUDENT:
      return isLibraryExercise(exercise);
    default:
      return false;
  }
};

export const getExerciseById = async (user: CurrentUser, id: number) => {
  // Phòng thủ giống POST: authenticate đã chặn tài khoản chưa ACTIVE, service vẫn tự kiểm.
  if (user.status !== UserStatus.ACTIVE) {
    throw businessError(
      403,
      "FORBIDDEN",
      "Tài khoản chưa được kích hoạt hoặc đã bị khóa"
    );
  }

  const exercise = await prisma.exercise.findUnique({
    where: { id },
    select: EXERCISE_SELECT,
  });

  if (!exercise || !canViewExercise(user, exercise)) {
    throw exerciseNotFound();
  }

  // HS: đi qua toStudentView để KHÔNG có answer (4c.5). Ở đây chưa có ngữ cảnh bài nộp
  // nên không lộ explanation (revealExplanation mặc định false).
  if (user.role === Role.STUDENT) {
    return toStudentView(exercise);
  }

  // ADMIN / TEACHER được xem: đủ field
  return exercise;
};

// ---------------------------------------------------------------------------
// Quyền QUẢN LÝ bài (sửa / ẩn) - dùng chung cho PATCH và DELETE
// ---------------------------------------------------------------------------

// Chỉ ADMIN hoặc GV chủ bài. HS và GV khác không có quyền -> nơi gọi trả 404.
export const canManageExercise = (
  user: CurrentUser,
  exercise: { createdById: number }
): boolean =>
  user.role === Role.ADMIN ||
  (user.role === Role.TEACHER && exercise.createdById === user.id);

// Phòng thủ giống createExercise: chỉ TEACHER/ADMIN đang ACTIVE được quản lý bài.
const assertActiveTeacherOrAdmin = (user: CurrentUser) => {
  if (user.role !== Role.TEACHER && user.role !== Role.ADMIN) {
    throw businessError(
      403,
      "FORBIDDEN",
      "Bạn không có quyền truy cập chức năng này"
    );
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw businessError(
      403,
      "FORBIDDEN",
      "Tài khoản chưa được kích hoạt hoặc đã bị khóa"
    );
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/exercises/:id
// ---------------------------------------------------------------------------
// Thứ tự kiểm tra (dừng ở lỗi đầu tiên):
//   1. Bài không tồn tại / không phải của mình (GV) -> 404
//   2. GV sửa bài PUBLISHED hoặc PROPOSED          -> 403 (chỉ ADMIN được sửa)
//   3. Gộp dữ liệu cũ + mới, kiểm skill-theo-type và T1 -> 400
//   4. Bài đã có người làm mà đổi content/answer/skill/level -> 409
//   5. Cập nhật (chỉ ghi các field được gửi) + đặt updated_at
export const updateExercise = async (
  user: CurrentUser,
  id: number,
  input: UpdateExerciseInput
) => {
  assertActiveTeacherOrAdmin(user);

  const existing = await prisma.exercise.findUnique({
    where: { id },
    select: EXERCISE_SELECT,
  });

  

  if (!existing || !canManageExercise(user, existing)) {
    throw exerciseNotFound();
  }

  // GV không được sửa bài đang chờ duyệt / đã công bố; chỉ ADMIN
  if (
    user.role === Role.TEACHER &&
    (existing.status === ExerciseStatus.PUBLISHED ||
      existing.status === ExerciseStatus.PROPOSED)
  ) {
    throw businessError(
      403,
      "FORBIDDEN",
      existing.status === ExerciseStatus.PUBLISHED
        ? "Bài đã được công bố, chỉ quản trị viên được sửa"
        : "Bài đang chờ duyệt, chỉ quản trị viên được sửa"
    );
  }

  // --- Gộp dữ liệu mới với cũ. type không đổi được nên luôn lấy từ DB. ---
  const hasContent = "content" in input;
  const hasAnswer = "answer" in input;

  const mergedSkill = input.skill ?? existing.skill;
  const mergedContent = hasContent ? input.content : existing.content;
  const mergedAnswer = hasAnswer ? input.answer : existing.answer;

  const problems: string[] = [];

  // Ràng buộc skill theo type (giống POST)
  const requiredSkill = SKILL_BY_TYPE[existing.type as ExerciseType];
  if (requiredSkill && mergedSkill !== requiredSkill) {
    problems.push(
      `skill: Dạng "${existing.type}" chỉ dùng với kỹ năng ${requiredSkill}`
    );
  }

  // Kiểm content/answer đã gộp bằng T1 (gồm kiểm tra chéo)
  const validated = validateExercise(
    existing.type,
    mergedContent,
    mergedAnswer
  );
  if (!validated.success) {
    problems.push(formatValidationErrors(validated.errors));
  }

  if (problems.length > 0 || !validated.success) {
    throw businessError(400, EXERCISE_VALIDATION_ERROR_CODE, problems.join("; "));
  }

  // --- Bài đã có người làm: khóa content/answer/skill/level (chỉ so khi giá trị THẬT SỰ đổi) ---
  const contentChanged =
    hasContent && !isDeepStrictEqual(validated.data.content, existing.content);
  const answerChanged =
    hasAnswer &&
    !isDeepStrictEqual(validated.data.answer ?? null, existing.answer ?? null);
  const skillChanged = input.skill !== undefined && input.skill !== existing.skill;
  const levelChanged = input.level !== undefined && input.level !== existing.level;

  if (contentChanged || answerChanged || skillChanged || levelChanged) {
    const attemptCount = await prisma.attempt.count({
      where: { exerciseId: id },
    });

    if (attemptCount > 0) {
      throw businessError(
        409,
        "CONFLICT",
        "Bài đã có học sinh làm nên không được đổi nội dung, đáp án, kỹ năng hoặc cấp độ (chỉ sửa được chủ đề và giải thích). Hãy tạo bài mới."
      );
    }
  }

  // --- Chỉ ghi các field client có gửi. updated_at đặt tường minh. ---
  const data: Prisma.ExerciseUpdateInput = { updatedAt: new Date() };

  if (input.topic !== undefined) data.topic = input.topic;
  if (input.skill !== undefined) data.skill = input.skill;
  if (input.level !== undefined) data.level = input.level;
  if (input.explanation !== undefined) data.explanation = input.explanation;

  // Dùng bản content/answer đã được T1 trim và chuẩn hóa
  if (hasContent) {
    data.content = validated.data.content as Prisma.InputJsonValue;
  }
  if (hasAnswer) {
    const answer = validated.data.answer;
    // writing/speaking: lưu NULL của SQL (Prisma.DbNull), KHÔNG phải JSON "null"
    data.answer =
      answer === null || answer === undefined
        ? Prisma.DbNull
        : (answer as Prisma.InputJsonValue);
  }

  return prisma.exercise.update({
    where: { id },
    data,
    select: EXERCISE_SELECT,
  });
};

//DELETE /api/v1/exercises/:id
export async function hideExercise(
  user: CurrentUser,
  exerciseId: number,
) {
  assertActiveTeacherOrAdmin(user);

  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: EXERCISE_SELECT,
  });

  if (!exercise || !canManageExercise(user, exercise)) {
    throw exerciseNotFound();
  }

  // Nếu bài tập đã ẩn, trả về dữ liệu hiện tại.
  // Không cập nhật DB lần nữa.
  if (exercise.status === ExerciseStatus.HIDDEN) {
    return exercise;
  }

  // Ẩn bài tập thay vì xóa khỏi database.
  return prisma.exercise.update({
    where: { id: exerciseId },
    data: {
      status: ExerciseStatus.HIDDEN,
      inLibrary: false,
    },
    select: EXERCISE_SELECT,
  });
}