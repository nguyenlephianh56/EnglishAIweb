import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { finalScoreOf } from "./attempt-list";
import type { TeacherGradeInput } from "./attempts.grade.schema";

const TEACHER_GRADE_ACTION = "attempt.teacher_grade";

export type TeacherGradeActor = { id: number; role: Role };

export type TeacherGradeResult = {
  id: number;
  score: number | null;
  teacher_score: number | null;
  teacher_comment: string | null;
  final_score: number | null;
  max_score: number;
};

type GradeAttemptRow = Omit<TeacherGradeResult, "final_score"> & {
  student_id: number;
  assignment_id: number;
};

async function lockGradeAttempt(
  db: Prisma.TransactionClient,
  actor: TeacherGradeActor,
  attemptId: number
): Promise<GradeAttemptRow | null> {
  const rows = await db.$queryRaw<GradeAttemptRow[]>(Prisma.sql`
    SELECT a.id, a.student_id, a.assignment_id, a.score,
           a.teacher_score, a.teacher_comment, a.max_score
    FROM attempts AS a
    JOIN assignments AS ag ON ag.id = a.assignment_id
    JOIN classes AS c ON c.id = ag.class_id
    WHERE a.id = ${attemptId}
      AND (${actor.role === Role.ADMIN}
        OR (${actor.role === Role.TEACHER} AND c.teacher_id = ${actor.id}))
    FOR UPDATE OF a
  `);

  return rows[0] ?? null;
}

export function updateTeacherGrade(
  actor: TeacherGradeActor,
  attemptId: number,
  input: TeacherGradeInput
): Promise<TeacherGradeResult | null> {
  return prisma.$transaction(async (tx) => {
    const before = await lockGradeAttempt(tx, actor, attemptId);
    if (before === null) return null;

    const teacherScore = input.teacher_score === undefined
      ? before.teacher_score
      : input.teacher_score;
    const teacherComment = input.teacher_comment === undefined
      ? before.teacher_comment
      : input.teacher_comment;
    const scoreChanged = teacherScore !== before.teacher_score;
    const commentChanged = teacherComment !== before.teacher_comment;

    if (scoreChanged || commentChanged) {
      await tx.attempt.update({
        where: { id: before.id },
        data: {
          teacherScore: scoreChanged ? teacherScore : undefined,
          teacherComment: commentChanged ? teacherComment : undefined,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: TEACHER_GRADE_ACTION,
          detail: {
            attempt_id: before.id,
            student_id: before.student_id,
            assignment_id: before.assignment_id,
            teacher_score: { from: before.teacher_score, to: teacherScore },
            comment_changed: commentChanged,
          },
        },
        select: { id: true },
      });
    }

    return {
      id: before.id,
      score: before.score,
      teacher_score: teacherScore,
      teacher_comment: teacherComment,
      final_score: finalScoreOf(before.score, teacherScore),
      max_score: before.max_score,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}