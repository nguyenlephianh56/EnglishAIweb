import { useParams } from "react-router-dom";
import ExerciseRunner from "./ExerciseRunner";
import { PageError, PageSkeleton } from "./RunnerShell";
import { usePracticeExercise } from "./useExerciseData";

/** /student/library/:id: tự luyện một bài thư viện (GET /exercises/:id, nộp POST /attempts {exerciseId}). */
export default function PracticePage() {
  const id = Number(useParams().id);
  const query = usePracticeExercise(id);

  if (!Number.isInteger(id) || id <= 0) {
    return <PageError error={new Error("Bài tập không hợp lệ.")} onRetry={() => undefined} backTo="/student/library" backLabel="Thư viện luyện tập" />;
  }
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) return <PageError error={query.error} onRetry={() => void query.refetch()} backTo="/student/library" backLabel="Thư viện luyện tập" />;
  return <ExerciseRunner key={query.data.id} exercise={query.data} />;
}
