/**
 * T17: nhận file âm thanh bằng multer, kiểm tra, lưu tạm. Chưa tạo attempt, chưa gọi AI.
 *
 * Thứ tự dùng ở route (bước sau): authenticate -> requireRole(STUDENT) -> kiểm quyền/bài
 * (resolveSubmitTarget + type = speaking) -> receiveAudioFile -> verifyUploadedAudio.
 * Quyền phải kiểm TRƯỚC receiveAudioFile, vì multer ghi file xuống đĩa ngay khi nhận được.
 *
 * An toàn:
 *  - Tên file do SERVER đặt: `<studentId>__<uuid>.<ext>`. Không bao giờ dùng originalname.
 *    <ext> lấy từ định dạng đã khai báo hợp lệ (webm/mp3/wav), rồi verifyUploadedAudio đối chiếu
 *    với chữ ký đầu file.
 *  - Mọi nhánh lỗi đều xóa file vừa ghi (multer tự xóa phần nó biết + ta xóa theo đường dẫn đã ghi
 *    nhận + dọn khi kết nối đóng mà file chưa được chấp nhận).
 *  - Không log tên file gốc, nội dung hay đường dẫn; chỉ log mã lỗi hệ thống.
 */

import { errorCodeForLog } from "../../utils/error-code-for-log";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import type { Request, RequestHandler } from "express";
import { env } from "../../config/env";
import { AudioUploadError } from "./attempts.audio.errors";
import {
  AUDIO_FIELD_NAME,
  ensureAudioTmpDir,
  getAudioTmpDir,
} from "./attempts.audio.config";
import {
  AUDIO_FORMATS,
  AUDIO_HEADER_BYTES,
  declaredAudioFormat,
  detectAudioFormat,
  type AudioFormat,
} from "./attempts.audio.magic";
import { AUDIO_ID_RE } from "./attempts.constants";

/** Dấu ngăn giữa studentId và uuid trong tên file. */
const NAME_SEPARATOR = "__";

// AUDIO_ID_RE (UUID v4 chữ thường) nằm ở attempts.constants.ts để schema request speaking dùng chung.

const STORED_NAME_RE = new RegExp(
  `^[0-9]+${NAME_SEPARATOR}([0-9a-f-]{36})\\.(${AUDIO_FORMATS.join("|")})$`
);

/** mime trả về cho client theo định dạng đã xác nhận bằng magic bytes (không lặp lại mime client gửi). */
const CANONICAL_MIME: Record<AudioFormat, string> = {
  webm: "audio/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

const MSG_INVALID_FORMAT = "Chỉ nhận tệp âm thanh webm, mp3 hoặc wav hợp lệ";
const MSG_BAD_UPLOAD =
  "Yêu cầu tải lên không hợp lệ: chỉ gửi đúng 1 tệp ở trường 'audio'";

/** Kết quả trả cho client. Tuyệt đối không có đường dẫn máy chủ hay tên file gốc. */
export interface AudioUploadResult {
  audio_id: string;
  size_bytes: number;
  mime: string;
}

// Đường dẫn file đã ghi của từng request, để dọn khi lỗi. Không giữ request sau khi xong.
const pendingPaths = new WeakMap<Request, string>();

// Request đã báo lỗi cho multer. Multer có khe hở: sau khi báo lỗi, các phần multipart còn lại trong
// CÙNG gói dữ liệu vẫn được xử lý và vẫn ghi file (vd gửi field chữ trước, file sau). Ta đánh dấu
// đồng bộ ngay khi nhận lỗi, và fileFilter bỏ qua mọi file đến sau đó.
const abortedRequests = new WeakSet<Request>();

const systemErrorCode = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
};

const isSystemError = (error: unknown): boolean => {
  const code = systemErrorCode(error);
  return code !== undefined && /^E[A-Z0-9]+$/.test(code); // ENOSPC, EACCES, ENOENT...
};

// ---------------------------------------------------------------------------
// multer
// ---------------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      cb(null, ensureAudioTmpDir());
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: (req, file, cb) => {
    const studentId = req.user?.id;
    if (typeof studentId !== "number" || !Number.isSafeInteger(studentId) || studentId < 1) {
      return cb(new AudioUploadError(401, "UNAUTHORIZED", "Vui lòng đăng nhập"), "");
    }

    const format = declaredAudioFormat(file.mimetype, file.originalname);
    if (format === null) {
      return cb(new AudioUploadError(400, "AUDIO_INVALID_FORMAT", MSG_INVALID_FORMAT), "");
    }

    const name = `${studentId}${NAME_SEPARATOR}${randomUUID()}.${format}`;
    pendingPaths.set(req, path.join(getAudioTmpDir(), name));
    cb(null, name);
  },
});

const uploader = multer({
  storage,
  limits: {
    // busboy phát 'limit' ngay khi file ĐẠT đúng giá trị này (không phải khi vượt). Truyền MAX + 1
    // để: đúng bằng AUDIO_MAX_BYTES -> nhận; vượt 1 byte (MAX + 1) -> LIMIT_FILE_SIZE (413).
    fileSize: env.AUDIO_MAX_BYTES + 1,
    files: 1,
    fields: 0, // không nhận field chữ: định danh bài nằm ở query
  },
  // Chặn sớm (trước khi ghi) khi mimetype/đuôi sai hoặc không khớp nhau.
  fileFilter: (req, file, cb) => {
    if (abortedRequests.has(req)) return cb(null, false); // request đã lỗi: không ghi thêm gì
    if (declaredAudioFormat(file.mimetype, file.originalname) === null) {
      return cb(new AudioUploadError(400, "AUDIO_INVALID_FORMAT", MSG_INVALID_FORMAT));
    }
    cb(null, true);
  },
}).single(AUDIO_FIELD_NAME);

/**
 * Lỗi hệ thống tệp (đĩa đầy, hết quyền...): CHỈ log mã lỗi. Không log chính lỗi vì message của
 * Node chứa đường dẫn đầy đủ. Client nhận message cố định.
 */
const storageError = (error: unknown): AudioUploadError => {
  console.error("[audio] storage error:", errorCodeForLog(error));
  return new AudioUploadError(
    500,
    "AUDIO_STORAGE_ERROR",
    "Không lưu được tệp âm thanh, vui lòng thử lại sau"
  );
};

/** Đổi lỗi multer/busboy thành lỗi đã biết. Lỗi hệ thống (đĩa đầy, không ghi được) -> 500 AUDIO_STORAGE_ERROR. */
const toUploadError = (error: unknown): unknown => {
  if (error instanceof AudioUploadError) return error;

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new AudioUploadError(
        413,
        "AUDIO_TOO_LARGE",
        `Tệp âm thanh vượt quá dung lượng cho phép (${env.AUDIO_MAX_BYTES} byte)`
      );
    }
    // LIMIT_UNEXPECTED_FILE (sai tên field hoặc file thứ hai), LIMIT_FILE_COUNT, LIMIT_FIELD_*...
    return new AudioUploadError(400, "AUDIO_BAD_UPLOAD", MSG_BAD_UPLOAD);
  }

  if (isSystemError(error)) return storageError(error);

  // Lỗi parse multipart của busboy (thiếu boundary, kết thúc giữa chừng...): lỗi do client.
  return new AudioUploadError(400, "AUDIO_BAD_UPLOAD", MSG_BAD_UPLOAD);
};

/** Xóa file vừa ghi của request này (nếu còn theo dõi). Không ném lỗi; chỉ log mã lỗi. */
export const discardAudioFile = async (req: Request): Promise<void> => {
  const filePath = pendingPaths.get(req);
  if (filePath === undefined) return;
  pendingPaths.delete(req);
  try {
    await fs.promises.rm(filePath, { force: true });
  } catch (error) {
    console.error("[audio] discard failed:", errorCodeForLog(error));
  }
};

/** Đánh dấu file đã được chấp nhận: từ đây không còn bị dọn tự động (T19 xóa sau khi xử lý). */
const acceptAudioFile = (req: Request): void => {
  pendingPaths.delete(req);
};

/**
 * Middleware nhận file. Lỗi -> file đã bị xóa rồi mới next(error) (errorHandler trả {data,error}).
 * Nếu kết nối đóng mà file chưa được verifyUploadedAudio chấp nhận (client ngắt giữa chừng,
 * handler lỗi...) thì file cũng bị xóa.
 */
export const receiveAudioFile: RequestHandler = (req, res, next) => {
  res.once("close", () => {
    void discardAudioFile(req);
  });

  uploader(req, res, (error?: unknown) => {
    if (error) {
      abortedRequests.add(req); // phải đồng bộ, trước khi multer xử lý tiếp phần multipart còn lại
      void discardAudioFile(req).then(() => next(toUploadError(error)));
      return;
    }
    next();
  });
};

// ---------------------------------------------------------------------------
// Kiểm tra sau khi ghi
// ---------------------------------------------------------------------------

const readHeader = async (filePath: string): Promise<Buffer> => {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(AUDIO_HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, AUDIO_HEADER_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/**
 * Gọi SAU receiveAudioFile. Thiếu file -> 400 AUDIO_REQUIRED. Chữ ký đầu file không khớp định dạng
 * đã khai báo -> xóa file, 400 AUDIO_INVALID_FORMAT. Đúng -> chấp nhận file và trả kết quả.
 */
export const verifyUploadedAudio = async (req: Request): Promise<AudioUploadResult> => {
  const file = req.file;
  if (!file) {
    throw new AudioUploadError(400, "AUDIO_REQUIRED", "Thiếu tệp âm thanh (trường 'audio')");
  }

  try {
    const detected = detectAudioFormat(await readHeader(file.path));
    const declared = declaredAudioFormat(file.mimetype, file.originalname);
    const stored = STORED_NAME_RE.exec(file.filename);

    if (detected === null || detected !== declared || stored === null || stored[2] !== detected) {
      throw new AudioUploadError(400, "AUDIO_INVALID_FORMAT", MSG_INVALID_FORMAT);
    }

    const result: AudioUploadResult = {
      audio_id: stored[1],
      size_bytes: file.size,
      mime: CANONICAL_MIME[detected],
    };
    acceptAudioFile(req);
    return result;
  } catch (error) {
    await discardAudioFile(req);
    throw isSystemError(error) ? storageError(error) : error;
  }
};

// ---------------------------------------------------------------------------
// Dành cho T18
// ---------------------------------------------------------------------------

/**
 * Tìm file âm thanh đã upload của đúng học sinh này. Trả đường dẫn tuyệt đối nằm trong thư mục
 * tạm, hoặc null nếu: studentId không hợp lệ, audioId sai định dạng, file không tồn tại, hoặc
 * file thuộc học sinh khác (tên file chứa studentId nên không tìm thấy). Không có logic nào khác.
 */
export const resolveAudioPath = (studentId: number, audioId: string): string | null => {
  if (!Number.isSafeInteger(studentId) || studentId < 1) return null;
  if (typeof audioId !== "string" || !AUDIO_ID_RE.test(audioId)) return null;

  const dir = getAudioTmpDir();
  for (const ext of AUDIO_FORMATS) {
    const candidate = path.join(dir, `${studentId}${NAME_SEPARATOR}${audioId}.${ext}`);
    if (path.dirname(candidate) !== dir) continue; // chốt an toàn: phải nằm thẳng trong thư mục tạm
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // không có file với đuôi này, thử đuôi tiếp theo
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// T19: vòng đời file sau khi upload (claim + xóa)
// ---------------------------------------------------------------------------

/** Đuôi thêm vào tên file khi một request "giành quyền" dùng file đó. */
export const CLAIMED_SUFFIX = ".claimed";

/** File đã claim: `path` có đuôi .claimed, `ext` là đuôi âm thanh gốc (".webm" | ".mp3" | ".wav"). */
export interface ClaimedAudio {
  path: string;
  ext: string;
}

/**
 * Giành quyền dùng file bằng đổi tên NGUYÊN TỬ (rename) sang `<tên gốc>.claimed`.
 * Trả null nếu không có file (sai HS, sai audio_id, đã bị claim/xóa). Hai request song song cùng
 * audio_id: hệ điều hành chỉ cho MỘT rename thành công, ca còn lại gặp ENOENT -> null.
 * Sau khi claim, resolveAudioPath không còn thấy file (đuôi .claimed không nằm trong danh sách
 * định dạng) nên audio_id chỉ dùng được MỘT lần. Lỗi khác ENOENT (khóa file, quyền...) được ném
 * ra để bên gọi báo lỗi lưu trữ (file vẫn còn nguyên, job dọn sẽ xử lý sau).
 */
export const claimAudioFile = async (
  studentId: number,
  audioId: string
): Promise<ClaimedAudio | null> => {
  const source = resolveAudioPath(studentId, audioId);
  if (source === null) return null;

  const claimedPath = `${source}${CLAIMED_SUFFIX}`;
  try {
    await fs.promises.rename(source, claimedPath);
  } catch (error) {
    if (systemErrorCode(error) === "ENOENT") return null; // request khác đã claim trước
    throw error;
  }
  return { path: claimedPath, ext: path.extname(source).toLowerCase() };
};

/**
 * Xóa file đã claim. KHÔNG BAO GIỜ ném lỗi: ENOENT coi như đã xong; lỗi khác (EPERM, EBUSY...)
 * chỉ log mã AUDIO_DELETE_FAILED (không log đường dẫn/tên file), file để job dọn xử lý sau.
 */
export const deleteClaimedAudio = async (claimedPath: string): Promise<void> => {
  try {
    await fs.promises.unlink(claimedPath);
  } catch (error) {
    if (systemErrorCode(error) === "ENOENT") return;
    console.error("[audio] AUDIO_DELETE_FAILED", errorCodeForLog(error));
  }
};