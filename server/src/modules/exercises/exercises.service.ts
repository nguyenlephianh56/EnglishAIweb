import {
  ExerciseSource,
  ExerciseStatus,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { CreateExerciseInput } from "./exercises.schema";
import { validateExercise } from "./validate-exercise";
import {
  EXERCISE_VALIDATION_ERROR_CODE,
  formatValidationErrors,
} from "./exercise-errors";

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