import { Router } from "express";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { validate, validateParams, validateQuery } from "../../middlewares/validate";
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
  unreadNotificationCountHandler,
} from "./notifications.controller";
import {
  notificationIdParamSchema,
  notificationsListQuerySchema,
  readAllNotificationsBodySchema,
} from "./notifications.schema";

export const notificationRoutes = Router();

notificationRoutes.use(authenticateActiveAccount);
notificationRoutes.get("/", validateQuery(notificationsListQuerySchema), listNotificationsHandler);
notificationRoutes.get("/unread-count", unreadNotificationCountHandler);
notificationRoutes.patch("/:id/read", validateParams(notificationIdParamSchema), markNotificationReadHandler);
notificationRoutes.post("/read-all", validate(readAllNotificationsBodySchema), markAllNotificationsReadHandler);