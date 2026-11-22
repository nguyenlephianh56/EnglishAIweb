import type { NextFunction, Request, Response } from "express";
import { failure, success } from "../../utils/response";
import type { NotificationIdParam, NotificationsListQuery } from "./notifications.schema";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.service";

export const listNotificationsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    const query = res.locals.query as NotificationsListQuery;
    return success(res, await listNotifications(req.user.id, query));
  } catch (error) {
    return next(error);
  }
};

export const unreadNotificationCountHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    return success(res, { unread_count: await countUnreadNotifications(req.user.id) });
  } catch (error) {
    return next(error);
  }
};

export const markNotificationReadHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    const { id } = res.locals.params as NotificationIdParam;
    const notification = await markNotificationRead(req.user.id, id);
    if (!notification) return failure(res, "NOT_FOUND", "Không tìm thấy thông báo", 404);
    return success(res, notification);
  } catch (error) {
    return next(error);
  }
};

export const markAllNotificationsReadHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    return success(res, await markAllNotificationsRead(req.user.id));
  } catch (error) {
    return next(error);
  }
};