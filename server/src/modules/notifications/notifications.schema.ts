import { z } from "zod";
import {
  MAX_INT4,
  NOTIFICATION_LIST_DEFAULT_LIMIT,
  NOTIFICATION_LIST_MAX_LIMIT,
} from "./notifications.constants";

const positiveInteger = (max: number, message: string) =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .regex(/^\d+$/, message)
    .transform(Number)
    .refine((value) => value >= 1 && value <= max, message);

export const notificationsListQuerySchema = z.object({
  limit: positiveInteger(
    NOTIFICATION_LIST_MAX_LIMIT,
    `limit phải là số nguyên từ 1 đến ${NOTIFICATION_LIST_MAX_LIMIT}`
  ).default(String(NOTIFICATION_LIST_DEFAULT_LIMIT)),
  cursor: positiveInteger(MAX_INT4, "cursor phải là mã thông báo hợp lệ").optional(),
  unread: z
    .enum(["true", "false"], { errorMap: () => ({ message: "unread phải là true hoặc false" }) })
    .default("false")
    .transform((value) => value === "true"),
});

export const notificationIdParamSchema = z.object({
  id: positiveInteger(MAX_INT4, "id phải là mã thông báo hợp lệ"),
});

export const readAllNotificationsBodySchema = z
  .object({})
  .strict({ message: "Body chỉ được để trống hoặc là {}" })
  .default({});

export type NotificationsListQuery = z.infer<typeof notificationsListQuerySchema>;
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;