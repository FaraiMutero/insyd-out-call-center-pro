import swaggerJSDoc from "swagger-jsdoc";

const PORT = process.env.PORT || 4000;

const definition = {
  openapi: "3.0.3",
  info: {
    title: "InsydOut Call Center Pro API",
    version: "0.1.0",
    description:
      "REST API for the InsydOut Call Center Pro recording analysis platform — auth, recordings, transcription/analysis pipeline, dashboards, coaching, SOPs/rubrics and audit trail."
  },
  servers: [{ url: "/api", description: "Current host (relative)" }],
  tags: [
    { name: "Auth", description: "Registration, login, session refresh, profile" },
    { name: "Users", description: "Admin user management (approve/reject/deactivate)" },
    { name: "Agents", description: "Agent profile CRUD — agents are users with role `agent`" },
    { name: "Recordings", description: "Upload, list, stream and update call recordings" },
    { name: "Calls", description: "Composite call report and re-analysis" },
    { name: "SOPs", description: "QA scoring rubrics" },
    { name: "Dashboard", description: "Org stats, leaderboard, agent detail, tip of day" },
    { name: "Coaching", description: "Per-agent coaching feed" },
    { name: "Audit", description: "Audit log (admin only)" },
    { name: "Export", description: "CSV exports" }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token issued by /auth/login or /auth/refresh. Some GET endpoints (recording stream, CSV export) also accept it as a `?token=` query param."
      }
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string", example: "VALIDATION_ERROR" },
          message: { type: "string", example: "Human readable detail" }
        }
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          email: { type: "string", format: "email" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          role: { type: "string", enum: ["admin", "manager", "qa", "agent"] },
          status: { type: "string", enum: ["pending", "active", "rejected", "deactivated"] },
          rejectionReason: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          approvedBy: { type: "integer", nullable: true },
          approvedAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      Recording: {
        type: "object",
        properties: {
          id: { type: "integer" },
          uploadedBy: { type: "integer" },
          originalFilename: { type: "string" },
          agentName: { type: "string", nullable: true },
          direction: { type: "string", enum: ["inbound", "outbound"], nullable: true },
          callDatetime: { type: "string", format: "date-time", nullable: true },
          status: {
            type: "string",
            enum: ["uploaded", "converting", "ready_for_transcription", "transcribing", "analyzing", "complete", "failed"]
          },
          error: { type: "string", nullable: true },
          storedPath: { type: "string", nullable: true },
          format: { type: "string", nullable: true },
          durationSec: { type: "number", nullable: true },
          sizeBytes: { type: "integer", nullable: true }
        }
      },
      Rubric: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          callType: { type: "string" },
          isActive: { type: "boolean" },
          criteria: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                weight: { type: "number" },
                description: { type: "string" }
              }
            }
          }
        }
      }
    }
  },
  security: [{ bearerAuth: [] }]
};

const options = {
  definition,
  apis: ["./src/routes/*.js", "./src/app.js"]
};

export const openapiSpec = swaggerJSDoc(options);
