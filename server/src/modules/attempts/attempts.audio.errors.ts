/**
 * T17: lỗi của luồng upload âm thanh. KHÔNG import env/prisma/multer để errorHandler
 * import thoải mái và test không cần DB.
 *
 * Message do server đặt, KHÔNG chứa tên file gốc, đường dẫn máy chủ hay chi tiết lỗi hệ thống.
 */
export type AudioErrorCode =
  | "UNAUTHORIZED" // 401: thiếu thông tin đăng nhập (không xảy ra nếu route đã có authenticate)
  | "AUDIO_REQUIRED" // 400: thiếu file
  | "AUDIO_INVALID_FORMAT" // 400: sai mimetype/đuôi/chữ ký đầu file, hoặc không phải webm/mp3/wav
  | "AUDIO_BAD_UPLOAD" // 400: field lạ, nhiều file, có field chữ, multipart hỏng
  | "AUDIO_TOO_LARGE" // 413: vượt AUDIO_MAX_BYTES
  | "AUDIO_WRONG_EXERCISE_TYPE" // 400: bài không phải dạng speaking
  | "AUDIO_STORAGE_ERROR"; // 500: không ghi/đọc được file tạm (đĩa đầy, hết quyền...)

export class AudioUploadError extends Error {
  readonly statusCode: number;
  readonly code: AudioErrorCode;

  constructor(statusCode: number, code: AudioErrorCode, message: string) {
    super(message);
    this.name = "AudioUploadError";
    this.statusCode = statusCode;
    this.code = code;
  }
}