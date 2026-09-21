import type { Request, RequestHandler } from "express";
import type { Prisma } from "@prisma/client";
import { db } from "@taskflow/db";
import { verifyToken } from "@taskflow/backend-common";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type AuthedRequest = Request & { userId: string };
export const asyncRoute = (fn: (req: AuthedRequest, res: import("express").Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { Promise.resolve(fn(req as AuthedRequest, res)).catch(next); };
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const userId = token && verifyToken(token);
  if (!userId) return next(new HttpError(401, "Please log in again."));
  (req as AuthedRequest).userId = userId;
  next();
};
export async function workspaceMember(workspaceId: string, userId: string) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!member) throw new HttpError(403, "You do not have access to this workspace.");
  return member;
}
export async function workspaceOwner(workspaceId: string, userId: string) {
  const member = await workspaceMember(workspaceId, userId);
  if (member.role !== "OWNER") throw new HttpError(403, "Only a workspace owner can do this.");
  return member;
}
export async function boardMember(boardId: string, userId: string) {
  const board = await db.board.findUnique({ where: { id: boardId }, select: { id: true, name: true, workspaceId: true } });
  if (!board) throw new HttpError(404, "Board not found.");
  await workspaceMember(board.workspaceId, userId);
  return board;
}
export async function taskMember(taskId: string, userId: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true, title: true, boardId: true, columnId: true, position: true } });
  if (!task) throw new HttpError(404, "Task not found.");
  const board = await boardMember(task.boardId, userId);
  return { task, board };
}
export async function activity(tx: Prisma.TransactionClient, workspaceId: string, boardId: string | null, actorId: string, action: string, entityId: string, metadata: Prisma.InputJsonValue = {}) {
  await tx.activityLog.create({ data: { workspaceId, boardId, actorId, action, entityId, metadata } });
}
export async function notify(tx: Prisma.TransactionClient, boardId: string, type: string) {
  await tx.$queryRaw`SELECT pg_notify('taskflow_events', ${JSON.stringify({ boardId, type })})::text`;
}
export function uuid(value: string | undefined): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, "Invalid ID.");
  return value;
}
