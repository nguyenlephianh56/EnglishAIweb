/**
 * T17: nhận diện định dạng file âm thanh. Chỉ có hàm thuần (không đọc env, không đụng DB).
 *
 * Một file chỉ được nhận khi BA thứ cùng chỉ về MỘT định dạng:
 *  1. mimetype client khai báo,
 *  2. đuôi file client khai báo (chỉ để KIỂM, không bao giờ dùng để đặt tên file),
 *  3. chữ ký đầu file (magic bytes) - thứ duy nhất client không giả được bằng cách đổi tên.
 */

export const AUDIO_FORMATS = ["webm", "mp3", "wav"] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/** Số byte đầu file cần đọc để nhận diện (wav cần 12 byte: "RIFF" + 4 byte cỡ + "WAVE"). */
export const AUDIO_HEADER_BYTES = 12;

const MIME_TO_FORMAT: Record<string, AudioFormat> = {
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
};

const EXT_TO_FORMAT: Record<string, AudioFormat> = {
  ".webm": "webm",
  ".mp3": "mp3",
  ".wav": "wav",
};

/** "Audio/WebM; codecs=opus" -> "audio/webm" (bỏ phần sau dấu ';', trim, chữ thường). */
export const normalizeMime = (mimetype: unknown): string => {
  if (typeof mimetype !== "string") return "";
  return mimetype.split(";")[0].trim().toLowerCase();
};

export const formatFromMime = (mimetype: unknown): AudioFormat | null =>
  MIME_TO_FORMAT[normalizeMime(mimetype)] ?? null;

/**
 * Lấy đuôi từ tên file client gửi. Không dùng module path để hàm này giống nhau ở mọi hệ điều
 * hành, và vì ta chỉ cần so đuôi: lấy từ dấu chấm CUỐI CÙNG của phần sau dấu / hoặc \ cuối.
 */
export const formatFromFilename = (originalname: unknown): AudioFormat | null => {
  if (typeof originalname !== "string") return null;
  const base = originalname.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT_TO_FORMAT[base.slice(dot).toLowerCase()] ?? null;
};

/**
 * Nhận diện bằng chữ ký đầu file:
 *  - webm: EBML 1A 45 DF A3
 *  - mp3 : "ID3" (có thẻ ID3) hoặc frame sync FF Fx
 *  - wav : "RIFF" + 4 byte cỡ + "WAVE"
 * Với frame sync, loại thêm layer = 00 (giá trị dành riêng; đây là dấu hiệu của AAC/ADTS,
 * không phải mp3), để tránh nhận nhầm file .aac đổi tên.
 */
export const detectAudioFormat = (header: Buffer): AudioFormat | null => {
  if (header.length >= 4 &&
      header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) {
    return "webm";
  }

  if (header.length >= 3 &&
      header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
    return "mp3";
  }
  if (header.length >= 2 && header[0] === 0xff && (header[1] & 0xf0) === 0xf0 &&
      (header[1] & 0x06) !== 0x00) {
    return "mp3";
  }

  if (header.length >= 12 &&
      header.toString("latin1", 0, 4) === "RIFF" &&
      header.toString("latin1", 8, 12) === "WAVE") {
    return "wav";
  }

  return null;
};

/** Phần khai báo của client (trước khi ghi file): mimetype và đuôi phải hợp lệ và CÙNG định dạng. */
export const declaredAudioFormat = (
  mimetype: unknown,
  originalname: unknown
): AudioFormat | null => {
  const byMime = formatFromMime(mimetype);
  const byExt = formatFromFilename(originalname);
  return byMime !== null && byMime === byExt ? byMime : null;
};