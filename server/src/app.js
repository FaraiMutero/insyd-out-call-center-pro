import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { runMigrations } from "./db/migrate.js";
import { authRoutes } from "./routes/authRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";
import { auditRoutes } from "./routes/auditRoutes.js";
import { recordingRoutes } from "./routes/recordingRoutes.js";
import { callRoutes } from "./routes/callRoutes.js";
import { sopRoutes } from "./routes/sopRoutes.js";
import { startRecordingWorker } from "./services/recordingPipeline.js";
import { hasAnyRubric, createRubric } from "./db/analysisRepository.js";
import { DEFAULT_OUTBOUND_RUBRIC } from "./services/defaultRubric.js";
import { errorHandler, notFound } from "./middleware/errors.js";

function ensureDefaultRubric() {
  if (!hasAnyRubric()) {
    createRubric({
      title: "Outbound Sales — Standard Rubric",
      callType: "outbound_sales",
      criteria: DEFAULT_OUTBOUND_RUBRIC,
    });
    console.log("[rubric] Default outbound-sales rubric created.");
  }
}

export function createApp() {
  runMigrations();
  ensureDefaultRubric();
  startRecordingWorker();

  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: true,
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "insydout-callcenter-pro-api" });
  });

  app.get("/api", (_req, res) => {
    res.json({
      name: "InsydOut Call Center Pro API",
      version: "0.1.0"
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/recordings", recordingRoutes);
  app.use("/api/calls", callRoutes);
  app.use("/api/sops", sopRoutes);

  app.use("/api", notFound);
  app.use(errorHandler);

  return app;
}
