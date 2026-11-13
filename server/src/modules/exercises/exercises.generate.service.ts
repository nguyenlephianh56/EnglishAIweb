import type { Role } from "@prisma/client";
import type { GenerateExerciseInput } from "./exercises.generate.schema";

export class GenerateExerciseNotImplementedError extends Error {
  readonly code = "NOT_IMPLEMENTED";
  readonly statusCode = 501;

  constructor() {
    super("Chức năng sinh bài bằng AI chưa được triển khai");
    this.name = "GenerateExerciseNotImplementedError";
  }
}

/** Stub T11: chỉ nhận user từ token và body đã được route kiểm tra. */
export async function generateExercise(
  _user: { id: number; role: Role },
  _input: GenerateExerciseInput
): Promise<never> {
  // TODO(T11): Dùng T10 dựng prompt key exercise_generate với skill, level, topic,
  // type, count, exercise_shape; nối runAiTask với userId/role từ _user.

  // TODO(T11): Kiểm kết quả bằng validateExercise (T1); sai thì thử lại 1 lần.
  // Phối hợp với retry của lớp AI hiện có để không thử lại nhiều lần ngoài ý muốn.

  // TODO(T11): Lưu bài qua Prisma: createdById = _user.id, source = "AI",
  // status = "DRAFT", inLibrary = false. Không nhận các field này từ client.

  throw new GenerateExerciseNotImplementedError();
}