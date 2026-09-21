import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db } from "@taskflow/db";
import { signToken } from "@taskflow/backend-common";
import { loginSchema, signupSchema } from "@taskflow/common";
import { asyncRoute, HttpError, requireAuth } from "./lib";

export const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });
authRouter.post("/signup", limiter, asyncRoute(async (req, res) => {
  const data = signupSchema.parse(req.body);
  const user = await db.user.create({ data: { email: data.email, name: data.name, passwordHash: await bcrypt.hash(data.password, 12) }, select: { id: true, email: true, name: true } });
  res.status(201).json({ user, token: signToken(user.id) });
}));
authRouter.post("/login", limiter, asyncRoute(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await db.user.findUnique({ where: { email: data.email } });
  if (!user?.passwordHash || !await bcrypt.compare(data.password, user.passwordHash)) throw new HttpError(401, "Invalid email or password.");
  res.json({ user: { id: user.id, email: user.email, name: user.name }, token: signToken(user.id) });
}));
authRouter.get("/me", requireAuth, asyncRoute(async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.userId }, select: { id: true, email: true, name: true } });
  if (!user) throw new HttpError(401, "Please log in again.");
  res.json({ user });
}));
