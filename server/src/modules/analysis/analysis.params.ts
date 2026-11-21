import { z } from "zod";

const MAX_INT4 = 2_147_483_647;

export const classIdParamSchema = z.object({
  classId: z.string()
    .regex(/^\d+$/, "Mã lớp phải là số nguyên dương")
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_INT4, "Mã lớp không hợp lệ")),
});