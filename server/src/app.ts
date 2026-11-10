import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { errorHandler } from "./middlewares/errorHandler";
import { authRoutes } from "./modules/auth/auth.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { classRoutes } from "./modules/classes/classes.routes";
import { exerciseRoutes } from "./modules/exercises/exercises.routes";

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
  } catch (error) {
    console.error("Database health check failed:", error);

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

// Class routes
app.use("/api/v1/classes", classRoutes);

// Exercise routes
app.use("/api/v1/exercises", exerciseRoutes);

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