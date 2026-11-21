import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  findStudentForSkillProfile,
  readSavedSkillProfiles,
} from "../skill-profiles/skill-profiles.service";
import { aggregateAnalysisStats } from "./analysis.stats";

export type AnalysisScope = "student" | "class";

export class AnalysisInputError extends Error {
  constructor(
    readonly statusCode: 404 | 422,
    readonly code: "CLASS_NOT_FOUND" | "NOT_ENOUGH_DATA",
    message: string,
  ) {
    super(message);
  }
}

async function loadStudent(studentId: number, teacherId?: number) {
  const target = await findStudentForSkillProfile(studentId, { teacherId });
  const rows = await readSavedSkillProfiles(target.id);
  return { target, rows };
}

async function loadClass(classId: number, teacherId?: number) {
  const where = { id: classId, ...(teacherId === undefined ? {} : { teacherId }) };
  const target = await prisma.class.findFirst({
    where,
    select: { id: true, name: true },
  });
  if (!target) throw new AnalysisInputError(404, "CLASS_NOT_FOUND", "Không tìm thấy lớp");

  const rows = await prisma.skillProfile.findMany({
    where: {
      student: {
        role: Role.STUDENT,
        status: UserStatus.ACTIVE,
        memberships: { some: { class: where } },
      },
    },
    select: { skill: true, score: true, level: true, errorStats: true },
  });
  return { target, rows };
}

export async function prepareAnalysis(scope: AnalysisScope, id: number, teacherId?: number) {
  const { target, rows } = scope === "student"
    ? await loadStudent(id, teacherId)
    : await loadClass(id, teacherId);
  const stats = aggregateAnalysisStats(scope, rows);
  if (Object.values(stats.skills).every((skill) => skill === null)) {
    throw new AnalysisInputError(422, "NOT_ENOUGH_DATA", "Chưa đủ dữ liệu để phân tích");
  }

  return { scope, target, stats };
}