import { z } from "zod";

const DEFAULT_OVERVIEW_DAYS = 30;
const MAX_OVERVIEW_DAYS = 90;
const daysMessage = `days phải là số nguyên từ 1 đến ${MAX_OVERVIEW_DAYS}`;

export const analyticsOverviewQuerySchema = z.object({
  days: z
    .string({ invalid_type_error: daysMessage })
    .regex(/^\d+$/, daysMessage)
    .transform(Number)
    .refine((days) => days >= 1 && days <= MAX_OVERVIEW_DAYS, daysMessage)
    .default(String(DEFAULT_OVERVIEW_DAYS)),
});

export type AnalyticsOverviewQuery = z.infer<typeof analyticsOverviewQuerySchema>;