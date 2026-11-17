// =====================================================================
// skill-profiles/skill-profiles.service.ts — Dựng hồ sơ kỹ năng của MỘT học sinh để trả cho API (T15).
//
// MỘT hàm dùng chung cho cả hai endpoint:
//   getStudentSkillProfile(studentId, { teacherId? })
//  - GET /skill-profiles/me                  → gọi với studentId lấy từ token (không có teacherId).
//  - GET /skill-profiles/students/:studentId → ADMIN: không có teacherId; TEACHER: truyền teacherId = id GV.
//
// Chỉ ĐỌC. Không ghi `skill_profiles`, không tính lại điểm/mức/lỗi (đọc nguyên từ dòng T14 đã upsert).
// Riêng `progress` tính lại từ `attempts` bằng đúng hàm T14 (fetchSkillAttempts + selectRepresentativeAttempts),
// không bảng mới, không cộng dồn.
//
// QUYỀN GV-LỚP nằm ở TRUY VẤN: khi có `teacherId`, câu tìm học sinh thêm điều kiện "HS có trong
// class_members của một lớp có classes.teacher_id = teacherId". Không thỏa → coi như không tìm thấy.
// Mọi lý do không xem được (id không có, không phải STUDENT, GV không có quyền) đều ném CÙNG MỘT lỗi 404,
// cùng thông điệp, để không lộ học sinh đó có tồn tại hay không.
// =====================================================================
import { Prisma, Role } from "@prisma/client";
import type { Skill } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { fetchSkillAttempts } from "./skill-profiles.attempts";
import { PROGRESS_MAX_POINTS } from "./skill-profiles.constants";
import type { ErrorStats } from "./skill-profiles.errors";
import { getFinalScore, selectRepresentativeAttempts } from "./skill-profiles.representative";
import {
  PROFILE_SKILL_ORDER,
  type SkillProfileItem,
  type SkillProgressPoint,
  type StudentSkillProfileResponse,
} from "./skill-profiles.schema";

/**
 * Lỗi 404 duy nhất của hai endpoint. Có `statusCode` + `code` để controller đổi thành response chuẩn
 * (cùng kiểu với handleError của module classes).
 */
export class StudentProfileNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "STUDENT_NOT_FOUND";

  constructor() {
    super("Không tìm thấy học sinh");
    this.name = "StudentProfileNotFoundError";
  }
}

export interface StudentSkillProfileOptions {
  /** Có giá trị = người xem là GV này: chỉ thấy HS thuộc lớp của GV đó. Bỏ trống = không giới hạn (ADMIN, hoặc HS xem chính mình). */
  teacherId?: number;
}

/**
 * Đọc an toàn cột JSON `error_stats`. Cột này do T14 ghi nhưng vẫn là JSON tự do trong DB, nên chỉ giữ
 * cặp { chuỗi: số hữu hạn >= 0 }; mọi thứ khác (null, mảng, giá trị lạ) bỏ qua. Không có gì hợp lệ → {}.
 * Dùng Map rồi Object.fromEntries để key như "__proto__" chỉ là key thường.
 */
const readErrorStats = (value: Prisma.JsonValue | null): ErrorStats => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const entries = new Map<string, number>();
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
      entries.set(key, count);
    }
  }
  return Object.fromEntries(entries);
};

/**
 * Đường tiến bộ của MỘT kỹ năng: tối đa PROGRESS_MAX_POINTS điểm đại diện GẦN NHẤT, xếp CŨ → MỚI.
 * Mỗi bài (bài giao theo assignment, tự luyện theo exercise) chỉ một điểm; điểm = COALESCE(teacher_score, score).
 * `selectRepresentativeAttempts` trả gần nhất trước, nên cắt rồi đảo ngược để ra cũ → mới.
 */
const buildProgress = async (studentId: number, skill: Skill): Promise<SkillProgressPoint[]> => {
  const rows = await fetchSkillAttempts(prisma, studentId, skill);
  const representatives = selectRepresentativeAttempts(rows).slice(0, PROGRESS_MAX_POINTS);

  const points: SkillProgressPoint[] = [];
  for (const attempt of representatives) {
    const score = getFinalScore(attempt);
    if (score === null) continue; // đại diện luôn có điểm hợp lệ; kiểm lại cho chắc, không ném lỗi
    points.push({ date: attempt.submittedAt.toISOString(), score });
  }
  return points.reverse();
};

/**
 * Hồ sơ kỹ năng của học sinh `studentId`, luôn đủ 5 kỹ năng theo PROFILE_SKILL_ORDER.
 * Kỹ năng chưa có dòng skill_profiles: score = null, level = null, error_stats = {}, updated_at = null.
 * (progress vẫn tính từ attempts nên có thể có điểm dù chưa có dòng hồ sơ; không có attempt thì [].)
 *
 * Ném StudentProfileNotFoundError khi: không có user đó, user không phải STUDENT, hoặc (khi có teacherId)
 * học sinh không thuộc lớp nào của GV đó.
 */
export const getStudentSkillProfile = async (
  studentId: number,
  options: StudentSkillProfileOptions = {}
): Promise<StudentSkillProfileResponse> => {
  const where: Prisma.UserWhereInput = { id: studentId, role: Role.STUDENT };
  if (options.teacherId !== undefined) {
    where.memberships = { some: { class: { teacherId: options.teacherId } } };
  }

  // Chỉ lấy id + name: không bao giờ đọc email/passwordHash vào bộ nhớ của hàm này.
  const student = await prisma.user.findFirst({
    where,
    select: { id: true, name: true },
  });
  if (student === null) throw new StudentProfileNotFoundError();

  const [profileRows, progressBySkill] = await Promise.all([
    prisma.skillProfile.findMany({
      where: { studentId: student.id },
      select: { skill: true, score: true, level: true, errorStats: true, updatedAt: true },
    }),
    Promise.all(PROFILE_SKILL_ORDER.map((skill) => buildProgress(student.id, skill))),
  ]);

  const profileBySkill = new Map(profileRows.map((row) => [row.skill, row]));

  const skills: SkillProfileItem[] = PROFILE_SKILL_ORDER.map((skill, index) => {
    const row = profileBySkill.get(skill);
    return {
      skill,
      score: row ? row.score : null,
      level: row ? row.level : null,
      error_stats: row ? readErrorStats(row.errorStats) : {},
      progress: progressBySkill[index],
      updated_at: row ? row.updatedAt.toISOString() : null,
    };
  });

  return { student: { id: student.id, name: student.name }, skills };
};