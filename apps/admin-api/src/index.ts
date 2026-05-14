import "dotenv/config";
import express from "express";
import cors from "cors";
import { metaRouter } from "./routes/meta";
import { authRouter } from "./routes/auth";
import { internalRouter } from "./routes/internal";
import { success, failure } from "./lib/response";

const app = express();
const PORT = Number(process.env.ADMIN_PORT ?? 4001);

app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json(success({ status: "ok", service: "admin-api" }));
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/meta", metaRouter);
app.use("/auth", authRouter);
app.use("/internal/v1", internalRouter);


// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[admin-api] Error:", err);
  
  if (err instanceof Error && "name" in err && err.name === "ZodError") {
    return res.status(400).json(failure("Validation failed", (err as any).errors));
  }

  res.status(500).json(failure(err.message || "Internal server error"));
});

const HOST = process.env.HOST ?? "127.0.0.1";

const start = async () => {
  // Check for migration flag
  if (process.argv.includes("--migrate-only")) {
    const { runMigrations } = await import("./db/migrate");
    await runMigrations();
    process.exit(0);
  }

  // Check for seed flag
  if (process.argv.includes("--seed")) {
    console.log("🌱 Manually triggering Seed...");
    const { seed } = await import("./seed/seed");
    await seed();
    process.exit(0);
  }

  app.listen(PORT, HOST, async () => {
    console.log(`🚀 Kivo Admin API running on http://${HOST}:${PORT}`);
    
    // Run migrations on startup anyway
    const { runMigrations } = await import("./db/migrate");
    await runMigrations().catch(err => {
      console.error("Failed to run migrations:", err);
    });
  });
};

start().catch(err => {
  console.error("Startup failed:", err);
  process.exit(1);
});

export default app;
