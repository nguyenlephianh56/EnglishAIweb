import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { analyzeClass, analyzeStudent } from "../../../api/analysis";
import { getErrorMessage } from "../../../api/client";
import type { ClassAnalysis, StudentAnalysis } from "../../../types/analysis";

export const classAnalysisKey = (id: number) => ["analysis", "class", id] as const;
export const studentAnalysisKey = (id: number) => ["analysis", "student", id] as const;

/** Giữ kết quả trong cache 1 giờ sau khi rời trang để quay lại vẫn thấy */
const KEEP_MS = 60 * 60 * 1000;

/** Lỗi khi phân tích, đổi sang lời nhắn dễ hiểu theo mã trạng thái */
export function analysisErrorMessage(err: unknown, scope: "class" | "student"): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (err.code === "ECONNABORTED") return "AI trả lời quá lâu, vui lòng thử lại sau ít phút.";
    if (status === 422) return getErrorMessage(err, "Chưa đủ dữ liệu để phân tích: học sinh cần làm thêm vài bài.");
    if (status === 404) return scope === "class" ? "Không tìm thấy lớp này hoặc lớp không thuộc tài khoản của thầy/cô." : "Không tìm thấy học sinh này hoặc học sinh không thuộc lớp của thầy/cô.";
    if (status === 429) return "Thầy/cô đã hết lượt dùng AI hôm nay, hãy thử lại vào ngày mai.";
    if (status === 502 || status === 503 || status === 504) return "AI đang bận hoặc trả kết quả chưa hợp lệ, vui lòng thử lại sau ít phút.";
  }
  return getErrorMessage(err, "Không phân tích được, vui lòng thử lại.");
}

interface AnalysisState<T> {
  /** Kết quả gần nhất trong cache (không tự gọi API) */
  result: T | undefined;
  /** Đang chạy phân tích cho đúng đối tượng này */
  running: boolean;
  /** Có phân tích nào đang chạy (kể cả đối tượng khác): khóa mọi nút để không gửi trùng và tốn lượt AI */
  busy: boolean;
  /** Lỗi của lần chạy gần nhất cho đối tượng này; kết quả cũ vẫn được giữ */
  errorMessage: string | undefined;
  run: () => void;
}

function useAnalysis<T>(scope: "class" | "student", id: number, keyOf: (id: number) => readonly unknown[], call: (id: number) => Promise<T>): AnalysisState<T> {
  const queryClient = useQueryClient();
  // skipToken: chỉ ĐỌC cache, không bao giờ gọi API khi mở trang
  const cached = useQuery<T>({ queryKey: keyOf(id), queryFn: skipToken, gcTime: KEEP_MS });
  const mutation = useMutation({
    mutationFn: (targetId: number) => call(targetId),
    // Ghi vào khóa của đúng đối tượng đã phân tích, kể cả khi người dùng đã đổi sang lớp khác
    onSuccess: (data, targetId) => queryClient.setQueryData(keyOf(targetId), data),
  });
  const mine = mutation.variables === id;
  return {
    result: cached.data,
    running: mutation.isPending && mine,
    busy: mutation.isPending,
    errorMessage: mutation.isError && mine ? analysisErrorMessage(mutation.error, scope) : undefined,
    run: () => {
      if (!mutation.isPending) mutation.mutate(id);
    },
  };
}

export const useClassAnalysis = (classId: number) => useAnalysis<ClassAnalysis>("class", classId, classAnalysisKey, analyzeClass);
export const useStudentAnalysis = (studentId: number) => useAnalysis<StudentAnalysis>("student", studentId, studentAnalysisKey, analyzeStudent);
