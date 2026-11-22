// =====================================================================
// learning-paths/learning-paths.path.service.ts — Lộ trình học tuần (T24, bản KHÔNG AI).
//
// - getCurrentPath: đọc lộ trình của tuần hiện tại (null nếu chưa có).
// - createCurrentPath: tạo lộ trình tuần hiện tại, IDEMPOTENT: gọi lại cùng tuần trả lộ trình cũ.
//
// VÌ SAO CẦN KHÓA: bảng learning_paths chỉ có index thường, KHÔNG có UNIQUE(student_id, week_start) và
// không được đổi DB. Hai request song song của cùng HS có thể cùng thấy "chưa có" rồi cùng tạo -> trùng.
// Nên trong transaction ta lấy `pg_advisory_xact_lock(studentId, số_tuần)` (tự nhả khi transaction kết thúc),
// rồi KIỂM TRA LẠI trước khi ghi. Request đến sau sẽ chờ, thấy dòng đã commit và trả lộ trình cũ.
//
// Gợi ý bài (recommendExercises) tính NGOÀI transaction vì nó chỉ đọc và dùng kết nối riêng; như vậy
// transaction không giữ một kết nối trong lúc chờ truy vấn khác.
//
// saveWeeklyPath: phần "khóa + kiểm lại + tạo path + tạo item" dùng CHUNG cho bản luật (createCurrentPath) và bản AI
// (learning-paths.path.ai.service.ts). Nơi gọi chuẩn bị xong danh sách {title, exerciseId} TRƯỚC khi gọi; tuyệt đối
// không gọi AI (hay bất kỳ việc chậm nào) bên trong hàm này vì nó đang giữ transaction và khóa.
// studentId luôn do controller lấy từ TOKEN; mọi truy vấn đều lọc theo studentId.
// =====================================================================
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { WEEKLY_PATH_SIZE } from "./learning-paths.constants";
import { buildItemTitle } from "./learning-paths.select";
import { recommendExercises } from "./learning-paths.service";
import { getWeekStart } from "./learning-paths.week";
import { toLearningPathView, type LearningPathView } from "./learning-paths.view";

const MS_PER_DAY = 86_400_000;

/** Không có bài nào phù hợp để tạo lộ trình (controller đổi thành 422). */
export class NoExercisesAvailableError extends Error {
  constructor() {
    super("NO_EXERCISES_AVAILABLE");
    this.name = "NoExercisesAvailableError";
  }
}

/** Item không tồn tại HOẶC không thuộc HS này (cùng một lỗi cho cả hai, 4c mục 10). Controller đổi thành 404. */
export class LearningPathItemNotFoundError extends Error {
  constructor() {
    super("LEARNING_PATH_ITEM_NOT_FOUND");
    this.name = "LearningPathItemNotFoundError";
  }
}

/** Một mục của lộ trình sắp tạo: tiêu đề đã chốt + id bài thật (server tự ánh xạ, không lấy từ client/AI). */
export interface PathItemInput {
  title: string;
  exerciseId: number;
}

/** Một truy vấn include lấy cả item lẫn bài; items theo id tăng dần (= thứ tự gợi ý). */
const PATH_INCLUDE = {
  items: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      done: true,
      exercise: {
        select: { id: true, type: true, skill: true, level: true, topic: true, status: true, inLibrary: true },
      },
    },
  },
} as const satisfies Prisma.LearningPathInclude;

type DbClient = Prisma.TransactionClient | typeof prisma;

const findPathOfWeek = (client: DbClient, studentId: number, weekStart: Date) =>
  client.learningPath.findFirst({
    where: { studentId, weekStart },
    orderBy: { id: "asc" },
    include: PATH_INCLUDE,
  });

export const getCurrentPath = async (
  studentId: number,
  now: Date = new Date(),
  timeZone: string = env.APP_TIMEZONE
): Promise<LearningPathView | null> => {
  const weekStart = getWeekStart(now, timeZone);
  const path = await findPathOfWeek(prisma, studentId, weekStart);
  return path === null ? null : toLearningPathView(path);
};

/**
 * Lưu lộ trình của tuần `weekStart` cho HS, IDEMPOTENT: trong transaction lấy khóa, kiểm tra LẠI, nếu tuần đó đã có
 * lộ trình thì trả lộ trình cũ (created: false), chưa có thì tạo path + item TUẦN TỰ theo đúng thứ tự `items`
 * (id tăng dần), `done = false`. `items` rỗng là lỗi lập trình của nơi gọi (không bao giờ tạo lộ trình rỗng).
 */
export const saveWeeklyPath = async (
  studentId: number,
  weekStart: Date,
  items: readonly PathItemInput[]
): Promise<{ created: boolean; path: LearningPathView }> => {
  if (items.length === 0) throw new NoExercisesAvailableError(); // chặn lộ trình rỗng, chưa ghi gì

  const weekNumber = Math.floor(weekStart.getTime() / MS_PER_DAY);

  return prisma.$transaction(async (tx) => {
    // ::int bắt buộc: Prisma gửi số dạng bigint, hàm (int, int) sẽ "không tồn tại" nếu thiếu.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${studentId}::int, ${weekNumber}::int)`;

    // Kiểm tra LẠI sau khi có khóa: request song song có thể vừa tạo xong.
    const again = await findPathOfWeek(tx, studentId, weekStart);
    if (again !== null) return { created: false, path: toLearningPathView(again) };

    const path = await tx.learningPath.create({ data: { studentId, weekStart }, select: { id: true } });
    // Tạo từng item theo thứ tự đã chọn để id tăng dần đúng thứ tự.
    for (const item of items) {
      await tx.learningPathItem.create({
        data: { pathId: path.id, title: item.title, exerciseId: item.exerciseId, done: false },
      });
    }

    const created = await tx.learningPath.findUniqueOrThrow({ where: { id: path.id }, include: PATH_INCLUDE });
    return { created: true, path: toLearningPathView(created) };
  });
};

export const createCurrentPath = async (
  studentId: number,
  now: Date = new Date(),
  timeZone: string = env.APP_TIMEZONE
): Promise<{ created: boolean; path: LearningPathView }> => {
  const weekStart = getWeekStart(now, timeZone);

  // Đường nhanh: đã có thì trả luôn, không tính gợi ý.
  const existing = await findPathOfWeek(prisma, studentId, weekStart);
  if (existing !== null) return { created: false, path: toLearningPathView(existing) };

  const picked = await recommendExercises(studentId, WEEKLY_PATH_SIZE);
  if (picked.length === 0) throw new NoExercisesAvailableError(); // chưa ghi gì -> 0 dòng

  return saveWeeklyPath(
    studentId,
    weekStart,
    picked.map((entry) => ({
      title: buildItemTitle(entry.skill, entry.level, entry.focusErrorType),
      exerciseId: entry.exercise.id,
    }))
  );
};

/**
 * Đặt `done` cho một item của CHÍNH học sinh này, rồi trả cả lộ trình chứa item đó (cùng dạng với GET).
 *
 * Quyền sở hữu nằm ngay trong điều kiện UPDATE (`path.studentId`), nên không có khoảng hở giữa "kiểm tra" và "ghi",
 * an toàn khi chạy song song, và gọi lặp lại cho cùng kết quả (idempotent). `count === 0` nghĩa là item không tồn tại
 * hoặc của người khác: hai trường hợp không thể phân biệt từ bên ngoài.
 */
export const setItemDone = async (studentId: number, itemId: number, done: boolean): Promise<LearningPathView> => {
  const updated = await prisma.learningPathItem.updateMany({
    where: { id: itemId, path: { studentId } },
    data: { done },
  });
  if (updated.count === 0) throw new LearningPathItemNotFoundError();

  const path = await prisma.learningPath.findFirst({
    where: { studentId, items: { some: { id: itemId } } },
    include: PATH_INCLUDE,
  });
  if (path === null) throw new LearningPathItemNotFoundError(); // item vừa bị xóa giữa hai truy vấn
  return toLearningPathView(path);
};