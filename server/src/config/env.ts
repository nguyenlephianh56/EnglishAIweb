
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must have at least 16 characters"),

  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),

  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default(""),

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
