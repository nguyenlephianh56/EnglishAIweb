import fs from "fs";
import path from "path";
import { env } from "../../config/env";

/** Tên field multipart DUY NHẤT được nhận. Field khác -> multer báo LIMIT_UNEXPECTED_FILE. */
export const AUDIO_FIELD_NAME = "audio";

/**
 * Đường dẫn tuyệt đối của thư mục tạm.
 * - Đường dẫn tương đối (mặc định "tmp/audio") tính từ thư mục chạy server, tức server/.
 *   Không dùng __dirname vì khi build, code nằm ở dist/src/... (khác vị trí khi chạy tsx).
 * - Dùng path.resolve nên chạy đúng trên Windows lẫn Linux/macOS.
 * - Thư mục này KHÔNG được đưa vào express.static (hiện app.ts không có express.static nào).
 */
export const getAudioTmpDir = (): string =>
  path.resolve(process.cwd(), env.AUDIO_TMP_DIR);

/** Tạo thư mục nếu chưa có (kể cả thư mục cha). Gọi nhiều lần vẫn an toàn. Trả về đường dẫn. */
export const ensureAudioTmpDir = (dir: string = getAudioTmpDir()): string => {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};