import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { openapiSpec } from "./config/openapi.js";
import { runMigrations } from "./db/migrate.js";
import { authRoutes } from "./routes/authRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";
import { agentRoutes } from "./routes/agentRoutes.js";
import { auditRoutes } from "./routes/auditRoutes.js";
import { recordingRoutes } from "./routes/recordingRoutes.js";
import { callRoutes } from "./routes/callRoutes.js";
import { sopRoutes } from "./routes/sopRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { coachingRoutes } from "./routes/coachingRoutes.js";
import { exportRoutes } from "./routes/exportRoutes.js";
import { startRecordingWorker } from "./services/recordingPipeline.js";
import { getActiveRubric, createRubric } from "./db/analysisRepository.js";
import { DEFAULT_OUTBOUND_RUBRIC, DEFAULT_INBOUND_RUBRIC } from "./services/defaultRubric.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { validateProviderConfig } from "./config/providerConfig.js";

function ensureDefaultRubric() {
  if (!getActiveRubric("outbound_sales")) {
    createRubric({
      title: "Outbound Sales — Standard Scorecard",
      callType: "outbound_sales",
      criteria: DEFAULT_OUTBOUND_RUBRIC,
    });
    console.log("[rubric] Default outbound-sales rubric created.");
  }
  if (!getActiveRubric("inbound")) {
    createRubric({
      title: "Inbound Support — Standard Scorecard",
      callType: "inbound",
      criteria: DEFAULT_INBOUND_RUBRIC,
    });
    console.log("[rubric] Default inbound-support rubric created.");
  }
}

export function createApp() {
  const providerConfig = validateProviderConfig();

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

  /**
   * @openapi
   * /health:
   *   get:
   *     summary: Health check
   *     security: []
   *     responses:
   *       200:
   *         description: Service is up
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean }
   *                 service: { type: string }
   *                 providers: { type: object }
   */
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "insydout-callcenter-pro-api", providers: providerConfig });
  });

  /**
   * @openapi
   * /:
   *   get:
   *     summary: API name/version banner
   *     security: []
   *     responses:
   *       200:
   *         description: API info
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties: { name: { type: string }, version: { type: string } }
   */
  app.get("/api", (_req, res) => {
    res.json({
      name: "InsydOut Call Center Pro API",
      version: "0.1.0"
    });
  });

  app.get("/api/openapi.json", (_req, res) => {
    res.json(openapiSpec);
  });

  // Helmet's default CSP blocks the inline script/style Swagger UI ships with —
  // drop it only for the docs route, leaving the rest of the app's CSP intact.
  app.use(
    "/api/docs",
    (_req, res, next) => {
      res.removeHeader("Content-Security-Policy");
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, { customSiteTitle: "InsydOut Call Center Pro API Docs" })
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/agents", agentRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/recordings", recordingRoutes);
  app.use("/api/calls", callRoutes);
  app.use("/api/sops", sopRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/coaching", coachingRoutes);
  app.use("/api/export", exportRoutes);

  app.use("/api", notFound);
  app.use(errorHandler);

  return app;
}
