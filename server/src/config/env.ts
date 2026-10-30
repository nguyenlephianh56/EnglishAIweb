import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default(""),
  AI_DAILY_LIMIT_STUDENT: z.coerce.number().default(10),
  AI_DAILY_LIMIT_TEACHER: z.coerce.number().default(50),
});

export const env = schema.parse(process.env);
