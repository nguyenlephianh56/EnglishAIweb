import { useParams } from "react-router-dom";
import ExerciseRunner from "./ExerciseRunner";
import { PageError, PageSkeleton } from "./RunnerShell";
import { useAssignmentDetail } from "./useExerciseData";

/** /student/assigned/:assignmentId: làm bài giao (GET /assignments/:id, nộp POST /attempts {assignmentId}). */
export default function AssignmentExercisePage() {
  const id = Number(useParams().assignmentId);
  const query = useAssignmentDetail(id);

  if (!Number.isInteger(id) || id <= 0) {
    return <PageError error={new Error("Bài giao không hợp lệ.")} onRetry={() => undefined} backTo="/student/assigned" backLabel="Bài được giao" />;
  }
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) return <PageError error={query.error} onRetry={() => void query.refetch()} backTo="/student/assigned" backLabel="Bài được giao" />;

  const { exercise, ...assignment } = query.data;
  // key theo bài giao: đổi sang bài khác thì làm lại từ đầu. Không key theo số lượt, để refetch không xóa bài đang làm.
  return <ExerciseRunner key={assignment.assignmentId} exercise={exercise} assignment={assignment} />;
}
