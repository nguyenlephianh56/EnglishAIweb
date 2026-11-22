import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { getAiDailyLimitsConfig } from "./ai/ai.usage.settings";
import { errorHandler } from "./middlewares/errorHandler";
import { authRoutes } from "./modules/auth/auth.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { analyticsRoutes } from "./modules/analytics/analytics.routes";
import { classRoutes } from "./modules/classes/classes.routes";
import { exerciseRoutes } from "./modules/exercises/exercises.routes";
import { attemptRoutes } from "./modules/attempts/attempts.routes";
import { assignmentRoutes } from "./modules/assignments/assignments.routes";
import { skillProfileRoutes } from "./modules/skill-profiles/skill-profiles.routes";
import { recommendationRoutes } from "./modules/learning-paths/learning-paths.recommendations.routes";
import { learningPathRoutes } from "./modules/learning-paths/learning-paths.routes";
import { notificationRoutes } from "./modules/notifications/notifications.routes";
import { reportsRoutes } from "./modules/reports/reports.routes";

export const app = express();

// CORS
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  })
);

// Đọc dữ liệu JSON
app.use(express.json({ limit: "1mb" }));

// Health check: Kiểm tra server
app.get("/api/v1/health", (_req, res) => {
  res.json({
    data: { status: "ok" },
    error: null,
  });
});

// Database health check: Kiểm tra PostgreSQL
app.get("/api/v1/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      data: {
        status: "ok",
        database: "connected",
      },
      error: null,
    });
  } catch {
    console.error("DATABASE_UNAVAILABLE");

    res.status(503).json({
      data: null,
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Không thể kết nối database",
      },
    });
  }
});

// Auth routes
app.use("/api/v1/auth", authRoutes);

// Admin routes
app.use("/api/v1/admin", adminRoutes);

// Thống kê hệ thống (T26)
app.use("/api/v1/analytics", analyticsRoutes);

// Class routes
app.use("/api/v1/classes", classRoutes);

// Exercise routes
app.use("/api/v1/exercises", (_req, res, next) => {
  res.locals.getAiDailyLimits = getAiDailyLimitsConfig;
  next();
}, exerciseRoutes);

// Attempt routes (nộp bài)
app.use("/api/v1/attempts", attemptRoutes);

// Assignment routes
app.use("/api/v1/assignments", assignmentRoutes);

// Skill profile routes (hồ sơ kỹ năng)
app.use("/api/v1/skill-profiles", skillProfileRoutes);

// Gợi ý bài cho học sinh (T24)
app.use("/api/v1/recommendations", recommendationRoutes);

// Lộ trình học tuần (T24)
app.use("/api/v1/learning-path", learningPathRoutes);

// Thông báo của tài khoản (T25)
app.use("/api/v1/notifications", notificationRoutes);

// Báo lỗi bài tập (T26)
app.use("/api/v1/reports", reportsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    data: null,
    error: {
      code: "NOT_FOUND",
      message: "Không tìm thấy",
    },
  });
});

// Error handler: Phải đặt cuối cùng
app.use(errorHandler);