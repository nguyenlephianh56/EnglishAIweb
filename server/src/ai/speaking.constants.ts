/** Giới hạn ký tự của transcript từ FE, tính sau khi trim. */
export const SPEAKING_TRANSCRIPT_MAX_CHARS = 2000;
/** Trần request inline, gồm base64 và prompt. */
export const SPEAKING_INLINE_REQUEST_MAX_BYTES = 20_000_000;

/** Chừa chỗ cho vỏ JSON và lời nhắc định dạng/retry. */
export const SPEAKING_INLINE_OVERHEAD_BYTES = 16 * 1024;

export const SPEAKING_AUDIO_MIME_TYPES: Readonly<Record<string, string>> =
  Object.freeze({
    ".webm": "audio/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  });
  export const SPEAKING_MAX_WORD_ISSUES = 20;
  /** Số từ tối thiểu để chấm một bản chữ. */
export const SPEAKING_MIN_TRANSCRIPT_WORDS = 3;