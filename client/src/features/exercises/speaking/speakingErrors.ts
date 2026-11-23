import axios from "axios";
import { getErrorCode, getErrorMessage } from "../../../api/client";

/** Lỗi khi tải âm thanh lên hoặc nộp bài Nói, đổi thành câu tiếng Việt dễ hiểu. Bản ghi luôn được giữ lại. */
export function speakingErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;

  switch (code) {
    case "TRANSCRIPT_TOO_SHORT":
      return "Bản ghi quá ngắn để chấm. Hãy nói dài hơn, ít nhất vài câu, rồi ghi lại.";
    case "TRANSCRIPT_TOO_LONG":
      return "Bản ghi quá dài để chấm. Hãy nói ngắn gọn hơn rồi ghi lại.";
    case "TRANSCRIPT_EMPTY":
      return "AI không nghe thấy lời nói trong bản ghi. Hãy kiểm tra micro, nói rõ hơn rồi ghi lại.";
    case "AUDIO_TOO_LARGE":
      return "Bản ghi quá lớn (tối đa 10 MB). Hãy ghi ngắn hơn.";
    case "AUDIO_INVALID_FORMAT":
      return "Âm thanh không đúng định dạng. Hãy ghi lại bằng Chrome, Edge hoặc Firefox.";
    case "AI_QUOTA_EXCEEDED":
      return "Bạn đã dùng hết lượt chấm AI hôm nay. Hãy quay lại vào ngày mai.";
    default:
  }
  if (status === 429) return "Bạn đã dùng hết lượt chấm AI hôm nay. Hãy quay lại vào ngày mai.";
  if (status === 413) return "Bản ghi quá lớn (tối đa 10 MB). Hãy ghi ngắn hơn.";
  if (status === 502 || status === 503 || status === 504) return "AI đang bận, chưa chấm được. Bản ghi của em vẫn còn, hãy bấm Nộp bài để thử lại sau ít phút.";
  if (axios.isAxiosError(error) && error.code === "ECONNABORTED") return "Chờ quá lâu mà chưa có kết quả. Bản ghi của em vẫn còn, hãy kiểm tra mạng rồi bấm Nộp bài để thử lại.";
  return getErrorMessage(error, "Không nộp được bài Nói, vui lòng thử lại.");
}
