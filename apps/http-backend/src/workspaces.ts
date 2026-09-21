import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { db } from "@taskflow/db";
import { inviteSchema, workspaceSchema } from "@taskflow/common";
import { activity, asyncRoute, HttpError, notify, requireAuth, uuid, workspaceMember, workspaceOwner } from "./lib";

export const workspaceRouter = Router();
workspaceRouter.use(requireAuth);
workspaceRouter.get("/", asyncRoute(async (req, res) => {
  const memberships = await db.workspaceMember.findMany({ where: { userId: req.userId }, include: { workspace: { include: { _count: { select: { members: true, boards: true } } } } }, orderBy: { joinedAt: "desc" } });
  res.json({ workspaces: memberships.map(({ workspace, role }) => ({ ...workspace, role })) });
}));
workspaceRouter.post("/", asyncRoute(async (req, res) => {
  const data = workspaceSchema.parse(req.body);
  const workspace = await db.$transaction(async tx => {
    const created = await tx.workspace.create({ data: { name: data.name, description: data.description } });
    await tx.workspaceMember.create({ data: { workspaceId: created.id, userId: req.userId, role: "OWNER" } });
    return created;
  });
  res.status(201).json({ workspace });
}));
workspaceRouter.get("/:workspaceId", asyncRoute(async (req, res) => {
  const workspaceId = uuid(req.params.workspaceId);
  await workspaceMember(workspaceId, req.userId);
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, include: { boards: { orderBy: { createdAt: "desc" }, include: { _count: { select: { tasks: true } } } }, members: { include: { user: { select: { id: true, name: true, email: true } } } }, activities: { take: 20, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } } } });
  res.json({ workspace });
}));
workspaceRouter.patch("/:workspaceId", asyncRoute(async (req, res) => {
  const workspaceId = uuid(req.params.workspaceId);
  await workspaceOwner(workspaceId, req.userId);
  const data = workspaceSchema.partial().parse(req.body);
  res.json({ workspace: await db.workspace.update({ where: { id: workspaceId }, data }) });
}));
workspaceRouter.delete("/:workspaceId/members/:userId", asyncRoute(async (req, res) => {
  const workspaceId = uuid(req.params.workspaceId), userId = uuid(req.params.userId);
  await workspaceOwner(workspaceId, req.userId);
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!member) throw new HttpError(404, "Member not found.");
  if (member.role === "OWNER") throw new HttpError(400, "An owner cannot be removed.");
  await db.$transaction(async tx => {
    await tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    await tx.taskAssignee.deleteMany({ where: { userId, task: { board: { workspaceId } } } });
    const boards = await tx.board.findMany({ where: { workspaceId }, select: { id: true } });
    for (const board of boards) await notify(tx, board.id, "MEMBER_REMOVED");
  });
  res.status(204).end();
}));
workspaceRouter.post("/:workspaceId/invites", asyncRoute(async (req, res) => {
  const workspaceId = uuid(req.params.workspaceId);
  await workspaceOwner(workspaceId, req.userId);
  const { email } = inviteSchema.parse(req.body);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invite = await db.invite.create({ data: { workspaceId, email, tokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) } });
  res.status(201).json({ invite: { id: invite.id, email, expiresAt: invite.expiresAt }, token });
}));
workspaceRouter.post("/invites/:token/accept", asyncRoute(async (req, res) => {
  const token = req.params.token;
  if (!token || token.length > 100) throw new HttpError(400, "Invalid invitation.");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const user = await db.user.findUniqueOrThrow({ where: { id: req.userId } });
  const invite = await db.invite.findUnique({ where: { tokenHash } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new HttpError(400, "Invitation is invalid, expired, or already used.");
  if (invite.email !== user.email) throw new HttpError(403, "This invitation was sent to a different email address. Sign in with the invited account.");
  await db.$transaction(async tx => {
    const claimed = await tx.invite.updateMany({ where: { id: invite.id, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
    if (claimed.count !== 1) throw new HttpError(409, "Invitation has already been used.");
    await tx.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } }, create: { workspaceId: invite.workspaceId, userId: user.id }, update: {} });
    await activity(tx, invite.workspaceId, null, user.id, "MEMBER_JOINED", user.id);
  });
  res.json({ workspaceId: invite.workspaceId });
}));
