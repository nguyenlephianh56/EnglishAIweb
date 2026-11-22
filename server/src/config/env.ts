import "dotenv/config";
import { z } from "zod";
import { WRITING_TEXT_MAX } from "../modules/attempts/attempts.constants";
import { DEFAULT_SKILL_WINDOW_SIZE } from "../modules/skill-profiles/skill-profiles.constants";
import { DEFAULT_APP_TIMEZONE } from "../modules/learning-paths/learning-paths.constants";
import { isValidTimeZone } from "../modules/learning-paths/learning-paths.week";

// Biến để trống ("") thì coi như không đặt -> dùng giá trị mặc định.
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

// Số nguyên >= 0 (0 = tắt), có trần để cấu hình nhầm không gây chờ quá lâu.
const nonNegativeInt = (defaultValue: number, max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(max).default(defaultValue)
  );

// Số nguyên >= 1, có trần (dùng cho giới hạn không được phép bằng 0).
const positiveInt = (defaultValue: number, max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(max).default(defaultValue)
  );

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must have at least 16 characters"),

  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),

  // Cho phép thiếu key khi khởi động; provider kiểm tra khi gọi AI.
  GEMINI_API_KEY: z.string().trim().default(""),

  // Thiếu hoặc để trống thì dùng model mặc định.
  GEMINI_MODEL: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).default("gemini-3.6-flash")
  ),

  // Đơn vị mili-giây; mặc định 30 giây.
  AI_TIMEOUT_MS: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce.number().int().positive().max(2_147_483_647).default(30000)
  ),

    // Thử lại khi AI báo 429 (hết hạn mức). MAX = số lần thử lại thêm, 0 = không thử lại.
  AI_RETRY_429_MAX: nonNegativeInt(1, 5),
  // Chờ mặc định (ms) khi AI không gợi ý thời gian chờ. Nếu AI gợi ý thì ưu tiên gợi ý (xem resilience.ts).
  AI_RETRY_429_DELAY_MS: nonNegativeInt(3000, 60000),

  // Thử lại khi lỗi mạng.
  AI_RETRY_NETWORK_MAX: nonNegativeInt(1, 5),
  AI_RETRY_NETWORK_DELAY_MS: nonNegativeInt(2000, 60000),


  AI_DAILY_LIMIT_STUDENT: z.coerce.number().default(10),
  AI_DAILY_LIMIT_TEACHER: z.coerce.number().default(50),

  AI_CACHE_TTL_SECONDS: nonNegativeInt(86400, 2_592_000),
  AI_CACHE_MAX_ENTRIES: nonNegativeInt(500, 100000),
  AI_CACHE_TASKS: z.preprocess(
    emptyToUndefined,
    z.string().trim().default("grade_writing,grade_speaking,analysis,path")
  ),
   WRITING_MAX_WORDS: positiveInt(600, 5000),
  WRITING_MAX_CHARS: positiveInt(4000, WRITING_TEXT_MAX),
  SKILL_WINDOW_SIZE: positiveInt(DEFAULT_SKILL_WINDOW_SIZE, 100),
  // Múi giờ để tính "thứ Hai của tuần" cho lộ trình học (T24). Tên IANA, vd Asia/Ho_Chi_Minh.
  APP_TIMEZONE: z.preprocess(
    emptyToUndefined,
    z.string().trim().refine(isValidTimeZone, "APP_TIMEZONE không phải múi giờ IANA hợp lệ").default(DEFAULT_APP_TIMEZONE)
  ),
    // Upload âm thanh (T17). Dung lượng tối đa MỖI file (byte): mặc định 10 MB, trần 50 MB.
  AUDIO_MAX_BYTES: positiveInt(10 * 1024 * 1024, 50 * 1024 * 1024),
  // Thư mục lưu tạm file âm thanh. Đường dẫn tương đối tính từ thư mục chạy server (server/).
  // PHẢI nằm ngoài mọi thư mục được phục vụ công khai.
  AUDIO_TMP_DIR: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).default("tmp/audio")
  ),
  // Dọn file âm thanh mồ côi (T19). TTL: file tạm quá số phút này (tính từ lúc upload) bị xóa.
  // Mặc định 60 phút, tối đa 24 giờ.
  AUDIO_TTL_MINUTES: positiveInt(60, 1440),
  // Chu kỳ quét (phút), 1-59 (dùng cú pháp cron "*/N"). Mặc định 10 phút.
  AUDIO_CLEANUP_INTERVAL_MINUTES: positiveInt(10, 59),
  // Chu kỳ quét nhắc hạn (T25), số nguyên từ 1 đến 59 phút. Mặc định 5 phút.
  REMINDER_SCAN_INTERVAL_MINUTES: positiveInt(5, 59),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const privateFields = new Set(["JWT_SECRET", "GEMINI_API_KEY"]);
  const invalidFields = Object.keys(parsedEnv.error.flatten().fieldErrors);
  console.error("Invalid environment variables", invalidFields.map((field) =>
    privateFields.has(field) ? "private configuration" : field
  ));
  process.exit(1);
}

export const env = parsedEnv.data;