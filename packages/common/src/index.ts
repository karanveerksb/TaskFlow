import { z } from "zod";

export const id = z.string().uuid();
export const email = z.string().trim().toLowerCase().email().max(254);
export const signupSchema = z.object({ name: z.string().trim().min(1).max(80), email, password: z.string().min(8).max(72) }).strict();
export const loginSchema = signupSchema.pick({ email: true, password: true });
export const workspaceSchema = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(500).optional() }).strict();
export const boardSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
export const columnSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();
export const taskSchema = z.object({ title: z.string().trim().min(1).max(160), description: z.string().max(10000).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(), dueDate: z.string().datetime().nullable().optional(), assigneeIds: z.array(id).max(30).optional() }).strict();
export const taskPatchSchema = taskSchema.partial().refine(value => Object.keys(value).length > 0);
export const commentSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();
export const inviteSchema = z.object({ email }).strict();
export const moveSchema = z.object({ targetColumnId: id, targetIndex: z.number().int().min(0) }).strict();
export const eventTypes = ["TASK_CREATED", "TASK_UPDATED", "TASK_MOVED", "TASK_DELETED", "COMMENT_CREATED", "COLUMN_CREATED", "COLUMN_UPDATED", "COLUMN_DELETED"] as const;
export type EventType = typeof eventTypes[number];
