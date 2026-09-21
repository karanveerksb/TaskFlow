import { config } from "dotenv";
import { resolve } from "node:path";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "@taskflow/db";

config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  WS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional()
});
const parsed = envSchema.parse(process.env);
export const env = { ...parsed, HTTP_PORT: parsed.HTTP_PORT ?? parsed.PORT ?? 3001, WS_PORT: parsed.WS_PORT ?? parsed.PORT ?? 8080 };
export const signToken = (userId: string) => jwt.sign({ sub: userId }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: "7d", issuer: "taskflow", audience: "taskflow-web" });
export function verifyToken(token: string): string | null {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"], issuer: "taskflow", audience: "taskflow-web" });
    return typeof claims !== "string" && typeof claims.sub === "string" ? claims.sub : null;
  } catch { return null; }
}
export async function boardAccess(boardId: string, userId: string) {
  return db.board.findFirst({ where: { id: boardId, workspace: { members: { some: { userId } } } }, select: { id: true, workspaceId: true, workspace: { select: { members: { where: { userId }, select: { role: true } } } } } });
}
