
import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { prisma } from "./config/prisma";

export const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

// Health check: Kiem tra server
app.get("/api/v1/health", (_req, res) => {
  res.json({ data: { status: "ok" }, error: null });
});

// Database health check: Kiem tra ket noi PostgreSQL
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
        message: "Khong the ket noi database",
      },
    });
  }
});

// TODO: app.use("/api/v1/auth", authRoutes); ... (moi module mot dong)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    data: null,
    error: {
      code: "NOT_FOUND",
      message: "Khong tim thay",
    },
  });
});
