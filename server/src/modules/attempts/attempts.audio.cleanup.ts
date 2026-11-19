/**
 * T19: dọn file âm thanh MỒ CÔI quá hạn trong thư mục tạm.
 * File mồ côi = upload xong không nộp, nộp bị từ chối trước bước chữ hóa, hoặc file đã claim mà
 * server sập trước khi xóa. Hàm không phụ thuộc cron/DB nên test được trực tiếp; job (jobs/) chỉ gọi hàm này.
 *
 * An toàn:
 *  - CHỈ xóa file nằm thẳng trong thư mục tạm, tên khớp mẫu do server đặt:
 *    `<studentId>__<uuid>.<webm|mp3|wav>` hoặc bản đã claim `...<đuôi>.claimed`.
 *  - Không đụng file lạ, không đi vào thư mục con, không theo symlink.
 *  - Quá hạn = (now - mtime) LỚN HƠN ttlMs; đúng bằng ttlMs thì còn giữ.
 *  - Một file lỗi không làm dừng lượt quét. Log chỉ có mã, không có tên file/đường dẫn.
 */
import { errorCodeForLog } from "../../utils/error-code-for-log";
import fs from "fs";
import path from "path";
import { getAudioTmpDir } from "./attempts.audio.config";
import { AUDIO_FORMATS } from "./attempts.audio.magic";
import { CLAIMED_SUFFIX } from "./attempts.audio.upload";

const NAME_SEPARATOR = "__"; // phải khớp attempts.audio.upload.ts

const MANAGED_NAME_RE = new RegExp(
  `^[0-9]+${NAME_SEPARATOR}[0-9a-f-]{36}\\.(${AUDIO_FORMATS.join("|")})` +
    `(${CLAIMED_SUFFIX.replace(/\./g, "\\.")})?$`
);

export interface CleanupExpiredAudioOptions {
  /** Mốc "bây giờ" (truyền vào để test chủ động). */
  now: Date;
  /** Tuổi tối đa (ms) tính theo thời gian sửa đổi; phải > 0. */
  ttlMs: number;
  /** Chỉ để test; mặc định là thư mục tạm từ .env. */
  dir?: string;
}

export interface CleanupExpiredAudioResult {
  /** Số file khớp mẫu tên đã xét. */
  scanned: number;
  deleted: number;
  /** Số file muốn xóa nhưng lỗi (khóa file, quyền...). Sẽ được thử lại ở lượt sau. */
  failed: number;
}

const errorCode = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "UNKNOWN";
};

export const cleanupExpiredAudio = async (
  options: CleanupExpiredAudioOptions
): Promise<CleanupExpiredAudioResult> => {
  const { now, ttlMs } = options;
  // ttl <= 0 sẽ xóa cả file vừa upload: coi là lỗi lập trình, không chạy.
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError("ttlMs phải là số dương");
  }

  const result: CleanupExpiredAudioResult = { scanned: 0, deleted: 0, failed: 0 };
  const dir = options.dir ?? getAudioTmpDir();

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      console.error("[audio] AUDIO_CLEANUP_FAILED", errorCodeForLog(error));
    }
    return result; // chưa có thư mục = chưa có gì để dọn
  }

  for (const entry of entries) {
    // isFile() là false với symlink và thư mục: không theo link, không đi vào thư mục con.
    if (!entry.isFile() || !MANAGED_NAME_RE.test(entry.name)) continue;
    result.scanned += 1;

    const filePath = path.join(dir, entry.name);
    try {
      const info = await fs.promises.lstat(filePath); // lstat: không theo symlink
      if (!info.isFile()) continue;
      if (now.getTime() - info.mtimeMs <= ttlMs) continue; // còn hạn (hoặc mtime ở tương lai)

      await fs.promises.unlink(filePath);
      result.deleted += 1;
    } catch (error) {
      if (errorCode(error) === "ENOENT") continue; // đã bị request khác xóa: coi như xong
      result.failed += 1;
      console.error("[audio] AUDIO_DELETE_FAILED", errorCodeForLog(error));
    }
  }

  return result;
};