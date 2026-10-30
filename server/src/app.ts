import express from "express";
import cors from "cors";
import { env } from "./config/env";

export const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/v1/health", (_req, res) => {
  res.json({ data: { status: "ok" }, error: null });
});

// TODO: app.use("/api/v1/auth", authRoutes); ... (moi module mot dong)

app.use((_req, res) => {
  res.status(404).json({ data: null, error: { code: "NOT_FOUND", message: "Khong tim thay" } });
});
