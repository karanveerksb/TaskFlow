import { Router } from "express";
import { db } from "@taskflow/db";
import { boardSchema, columnSchema } from "@taskflow/common";
import { activity, asyncRoute, boardMember, HttpError, notify, requireAuth, uuid, workspaceMember, workspaceOwner } from "./lib";

export const boardRouter = Router();
boardRouter.use(requireAuth);
const taskInclude = { assignees: { include: { user: { select: { id: true, name: true, email: true } } } }, _count: { select: { comments: true } } } as const;
boardRouter.get("/:boardId", asyncRoute(async (req, res) => {
  const boardId = uuid(req.params.boardId);
  await boardMember(boardId, req.userId);
  const board = await db.board.findUnique({ where: { id: boardId }, include: {
    workspace: { select: { id: true, name: true, members: { include: { user: { select: { id: true, name: true, email: true } } } } } },
    columns: { orderBy: { position: "asc" }, include: { tasks: { orderBy: { position: "asc" }, include: taskInclude } } },
    activities: { take: 20, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } }
  } });
  res.json({ board });
}));
boardRouter.patch("/:boardId", asyncRoute(async (req, res) => {
  const board = await boardMember(uuid(req.params.boardId), req.userId);
  await workspaceOwner(board.workspaceId, req.userId);
  const data = boardSchema.parse(req.body);
  res.json({ board: await db.board.update({ where: { id: board.id }, data }) });
}));
boardRouter.delete("/:boardId", asyncRoute(async (req, res) => {
  const board = await boardMember(uuid(req.params.boardId), req.userId);
  await workspaceOwner(board.workspaceId, req.userId);
  await db.board.delete({ where: { id: board.id } });
  res.status(204).end();
}));
boardRouter.post("/:boardId/columns", asyncRoute(async (req, res) => {
  const board = await boardMember(uuid(req.params.boardId), req.userId);
  const data = columnSchema.parse(req.body);
  const column = await db.$transaction(async tx => {
    const last = await tx.column.findFirst({ where: { boardId: board.id }, orderBy: { position: "desc" } });
    const created = await tx.column.create({ data: { boardId: board.id, name: data.name, position: (last?.position ?? -1) + 1 } });
    await activity(tx, board.workspaceId, board.id, req.userId, "COLUMN_CREATED", created.id, { name: created.name });
    await notify(tx, board.id, "COLUMN_CREATED");
    return created;
  });
  res.status(201).json({ column });
}));
boardRouter.get("/:boardId/activity", asyncRoute(async (req, res) => {
  const board = await boardMember(uuid(req.params.boardId), req.userId);
  const activities = await db.activityLog.findMany({ where: { boardId: board.id }, take: 50, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } });
  res.json({ activities });
}));

export const workspaceBoardsRouter = Router({ mergeParams: true });
workspaceBoardsRouter.use(requireAuth);
workspaceBoardsRouter.get("/", asyncRoute(async (req, res) => {
  const workspaceId = uuid(req.params.workspaceId);
  await workspaceMember(workspaceId, req.userId);
  res.json({ boards: await db.board.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }) });
}));
workspaceBoardsRouter.post("/", asyncRoute(async (req, res) => {
  const workspaceId = uuid(req.params.workspaceId);
  await workspaceOwner(workspaceId, req.userId);
  const { name } = boardSchema.parse(req.body);
  const board = await db.$transaction(async tx => {
    const created = await tx.board.create({ data: { workspaceId, name, columns: { create: [
      { name: "Backlog", position: 0 }, { name: "To Do", position: 1 }, { name: "In Progress", position: 2 }, { name: "Done", position: 3 }
    ] } } });
    await activity(tx, workspaceId, created.id, req.userId, "BOARD_CREATED", created.id, { name });
    return created;
  });
  res.status(201).json({ board });
}));

export const columnRouter = Router();
columnRouter.use(requireAuth);
columnRouter.patch("/:columnId", asyncRoute(async (req, res) => {
  const columnId = uuid(req.params.columnId);
  const column = await db.column.findUnique({ where: { id: columnId } });
  if (!column) throw new HttpError(404, "Column not found.");
  const board = await boardMember(column.boardId, req.userId);
  const { name } = columnSchema.parse(req.body);
  const updated = await db.$transaction(async tx => {
    const item = await tx.column.update({ where: { id: columnId }, data: { name } });
    await activity(tx, board.workspaceId, board.id, req.userId, "COLUMN_UPDATED", columnId, { name });
    await notify(tx, board.id, "COLUMN_UPDATED");
    return item;
  });
  res.json({ column: updated });
}));
columnRouter.delete("/:columnId", asyncRoute(async (req, res) => {
  const columnId = uuid(req.params.columnId);
  const column = await db.column.findUnique({ where: { id: columnId }, include: { _count: { select: { tasks: true } } } });
  if (!column) throw new HttpError(404, "Column not found.");
  const board = await boardMember(column.boardId, req.userId);
  if (column._count.tasks) throw new HttpError(409, "Move or delete tasks before deleting this column.");
  await db.$transaction(async tx => {
    await tx.column.delete({ where: { id: columnId } });
    await activity(tx, board.workspaceId, board.id, req.userId, "COLUMN_DELETED", columnId, { name: column.name });
    await notify(tx, board.id, "COLUMN_DELETED");
  });
  res.status(204).end();
}));
