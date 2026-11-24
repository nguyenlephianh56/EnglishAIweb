import { Role } from "@prisma/client";
import { z } from "zod";

export const promoteAdminBodySchema = z.undefined();

export const revokeAdminBodySchema = z
  .object({
    role: z.enum([Role.TEACHER, Role.STUDENT]),
  })
  .strict();

export type RevokeAdminBody = z.infer<typeof revokeAdminBodySchema>;