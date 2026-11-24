import { Prisma } from "@prisma/client";

const USER_FOREIGN_KEYS = [
  ["classes", "teacher_id"],
  ["class_members", "student_id"],
  ["exercises", "created_by_id"],
  ["assignments", "assigned_by_id"],
  ["attempts", "student_id"],
  ["skill_profiles", "student_id"],
  ["learning_paths", "student_id"],
  ["notifications", "user_id"],
  ["exercise_reports", "reporter_id"],
  ["ai_usage_logs", "user_id"],
  ["audit_logs", "user_id"],
] as const;

// Trong luồng xóa, bên gọi khóa dòng users bằng FOR UPDATE trước khi gọi hàm này.
export async function hasUserRelatedData(
  tx: Prisma.TransactionClient,
  userId: number
): Promise<boolean> {
  // Tên bảng và cột lấy từ danh sách cố định. ID truyền qua tham số SQL.
  const checks = USER_FOREIGN_KEYS.map(([table, column]) => Prisma.sql`
    EXISTS (SELECT 1 FROM ${Prisma.raw(table)} WHERE ${Prisma.raw(column)} = ${userId})
  `);
  const [result] = await tx.$queryRaw<[{ hasRelatedData: boolean }]>`
    SELECT ${Prisma.join(checks, " OR ")} AS "hasRelatedData"
  `;

  return result.hasRelatedData;
}