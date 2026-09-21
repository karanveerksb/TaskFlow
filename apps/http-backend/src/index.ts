import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@taskflow/db";
import { env } from "@taskflow/backend-common";
import { authRouter } from "./auth";
import { boardRouter, columnRouter, workspaceBoardsRouter } from "./boards";
import { HttpError } from "./lib";
import { columnTasksRouter, taskRouter } from "./tasks";
import { workspaceRouter } from "./workspaces";

export const app = express();
app.use(helmet());
app.use(cors({ origin: new URL(env.FRONTEND_URL).origin }));
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => { res.json({ status: "ok" }); });
app.get("/ready", async (_req, res) => {
  try { await db.$queryRaw`SELECT 1`; res.json({ status: "ready" }); }
  catch { res.status(503).json({ status: "unavailable" }); }
});
app.use("/api/auth", authRouter);
app.use("/api/workspaces", workspaceRouter);
app.use("/api/workspaces/:workspaceId/boards", workspaceBoardsRouter);
app.use("/api/boards", boardRouter);
app.use("/api/columns", columnRouter);
app.use("/api/columns/:columnId/tasks", columnTasksRouter);
app.use("/api/tasks", taskRouter);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return res.status(400).json({ message: "Invalid input.", issues: error.flatten() });
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ message: "This name or email is already in use." });
  console.error(error);
  res.status(500).json({ message: "Something went wrong. Please try again." });
});
if (require.main === module) app.listen(env.HTTP_PORT, () => console.log(`TaskFlow API listening on ${env.HTTP_PORT}`));
