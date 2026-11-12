
import "dotenv/config";
import { z } from "zod";

// Biến để trống ("") thì coi như không đặt -> dùng giá trị mặc định.
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

// Số nguyên >= 0 (0 = tắt), có trần để cấu hình nhầm không gây chờ quá lâu.
const nonNegativeInt = (defaultValue: number, max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(max).default(defaultValue)
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
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:");
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
