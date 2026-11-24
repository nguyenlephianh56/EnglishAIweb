import { Sparkles } from "lucide-react";
import Modal from "../../../components/ui/Modal";
import AnalysisToolbar from "./AnalysisToolbar";
import StudentAnalysisView from "./StudentAnalysisView";
import { useStudentAnalysis } from "./useAnalysis";
import type { ClassStudent } from "../../../types/teacher";

/** Hộp thoại phân tích AI của một học sinh. Kết quả được lưu theo học sinh nên mở lại vẫn thấy bản gần nhất. */
export default function StudentAnalysisModal({ student, onClose }: { student: ClassStudent | null; onClose: () => void }) {
  return (
    <Modal size="lg" open={student !== null} onClose={onClose} title={student ? `Phân tích: ${student.name}` : ""} description="Nhận xét năng lực và lỗi thường gặp của học sinh, do AI tổng hợp từ các bài đã làm.">
      {student && <Body key={student.id} studentId={student.id} />}
    </Modal>
  );
}

function Body({ studentId }: { studentId: number }) {
  const { result, running, busy, errorMessage, run } = useStudentAnalysis(studentId);
  return (
    <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
      <AnalysisToolbar generatedAt={result?.generated_at} running={running} busy={busy} errorMessage={errorMessage} onRun={run} startLabel="Phân tích học sinh bằng AI" />
      {result ? (
        <StudentAnalysisView result={result} />
      ) : (
        !running && (
          <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-600" aria-hidden="true">
              <Sparkles className="size-6" />
            </span>
            <p className="mt-3 text-sm text-slate-500">Chưa có kết quả. Bấm nút phía trên để AI phân tích (mất 10–30 giây và tính vào lượt AI trong ngày).</p>
          </div>
        )
      )}
    </div>
  );
}
