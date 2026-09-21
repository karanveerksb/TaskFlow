import { Router } from "express";
import { Prisma } from "@prisma/client";
import { db } from "@taskflow/db";
import { commentSchema, moveSchema, taskPatchSchema, taskSchema } from "@taskflow/common";
import { activity, asyncRoute, boardMember, HttpError, notify, requireAuth, taskMember, uuid } from "./lib";

export const columnTasksRouter = Router({ mergeParams: true });
columnTasksRouter.use(requireAuth);
columnTasksRouter.post("/", asyncRoute(async (req, res) => {
  const columnId = uuid(req.params.columnId);
  const column = await db.column.findUnique({ where: { id: columnId } });
  if (!column) throw new HttpError(404, "Column not found.");
  const board = await boardMember(column.boardId, req.userId);
  const data = taskSchema.parse(req.body);
  if (data.assigneeIds?.length) await validateAssignees(board.workspaceId, data.assigneeIds);
  const task = await db.$transaction(async tx => {
    const last = await tx.task.findFirst({ where: { columnId }, orderBy: { position: "desc" } });
    const created = await tx.task.create({ data: { boardId: board.id, columnId, title: data.title, description: data.description ?? "", priority: data.priority ?? "MEDIUM", dueDate: data.dueDate ? new Date(data.dueDate) : null, position: (last?.position ?? -1) + 1, assignees: { create: (data.assigneeIds ?? []).map(userId => ({ userId })) } } });
    await activity(tx, board.workspaceId, board.id, req.userId, "TASK_CREATED", created.id, { title: created.title });
    await notify(tx, board.id, "TASK_CREATED");
    return created;
  });
  res.status(201).json({ task });
}));

export const taskRouter = Router();
taskRouter.use(requireAuth);
taskRouter.get("/:taskId", asyncRoute(async (req, res) => {
  const { task } = await taskMember(uuid(req.params.taskId), req.userId);
  const detail = await db.task.findUnique({ where: { id: task.id }, include: { assignees: { include: { user: { select: { id: true, name: true, email: true } } } }, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } } } });
  res.json({ task: detail });
}));
taskRouter.patch("/:taskId", asyncRoute(async (req, res) => {
  const { task, board } = await taskMember(uuid(req.params.taskId), req.userId);
  const data = taskPatchSchema.parse(req.body);
  if (data.assigneeIds) await validateAssignees(board.workspaceId, data.assigneeIds);
  const updated = await db.$transaction(async tx => {
    const item = await tx.task.update({ where: { id: task.id }, data: { title: data.title, description: data.description, priority: data.priority, dueDate: data.dueDate === undefined ? undefined : data.dueDate === null ? null : new Date(data.dueDate), ...(data.assigneeIds ? { assignees: { deleteMany: {}, create: data.assigneeIds.map(userId => ({ userId })) } } : {}) } });
    await activity(tx, board.workspaceId, board.id, req.userId, "TASK_UPDATED", task.id, { title: item.title });
    await notify(tx, board.id, "TASK_UPDATED");
    return item;
  });
  res.json({ task: updated });
}));
taskRouter.delete("/:taskId", asyncRoute(async (req, res) => {
  const { task, board } = await taskMember(uuid(req.params.taskId), req.userId);
  await db.$transaction(async tx => {
    await tx.task.delete({ where: { id: task.id } });
    await activity(tx, board.workspaceId, board.id, req.userId, "TASK_DELETED", task.id, { title: task.title });
    await notify(tx, board.id, "TASK_DELETED");
  });
  res.status(204).end();
}));
taskRouter.post("/:taskId/move", asyncRoute(async (req, res) => {
  const { task, board } = await taskMember(uuid(req.params.taskId), req.userId);
  const { targetColumnId, targetIndex } = moveSchema.parse(req.body);
  const targetColumn = await db.column.findUnique({ where: { id: targetColumnId } });
  if (!targetColumn || targetColumn.boardId !== board.id) throw new HttpError(400, "Target column must be on this board.");
  let moved;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      moved = await db.$transaction(async tx => {
        const current = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
        const source = (await tx.task.findMany({ where: { columnId: current.columnId, id: { not: current.id } }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } })).map(t => t.id);
        const target = current.columnId === targetColumnId ? source : (await tx.task.findMany({ where: { columnId: targetColumnId }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } })).map(t => t.id);
        target.splice(Math.min(targetIndex, target.length), 0, current.id);
        await tx.task.update({ where: { id: current.id }, data: { columnId: targetColumnId } });
        await Promise.all(source.map((id, position) => tx.task.update({ where: { id }, data: { position } })));
        await Promise.all(target.map((id, position) => tx.task.update({ where: { id }, data: { position } })));
        await activity(tx, board.workspaceId, board.id, req.userId, "TASK_MOVED", current.id, { title: current.title, fromColumnId: current.columnId, toColumnId: targetColumnId });
        await notify(tx, board.id, "TASK_MOVED");
        return tx.task.findUniqueOrThrow({ where: { id: current.id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      break;
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt === 2) throw error;
    }
  }
  res.json({ task: moved });
}));
taskRouter.post("/:taskId/comments", asyncRoute(async (req, res) => {
  const { task, board } = await taskMember(uuid(req.params.taskId), req.userId);
  const { body } = commentSchema.parse(req.body);
  const comment = await db.$transaction(async tx => {
    const created = await tx.comment.create({ data: { taskId: task.id, authorId: req.userId, body }, include: { author: { select: { id: true, name: true } } } });
    await activity(tx, board.workspaceId, board.id, req.userId, "COMMENT_CREATED", created.id, { taskId: task.id, title: task.title });
    await notify(tx, board.id, "COMMENT_CREATED");
    return created;
  });
  res.status(201).json({ comment });
}));

async function validateAssignees(workspaceId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new HttpError(400, "Duplicate assignees are not allowed.");
  const count = await db.workspaceMember.count({ where: { workspaceId, userId: { in: ids } } });
  if (count !== ids.length) throw new HttpError(400, "Assignees must belong to this workspace.");
}
