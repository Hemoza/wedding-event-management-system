import type { Request, Response, NextFunction, Express } from "express";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
export type User = {
  id: number;
  name: string;
  email: string;
  role: "customer" | "admin";
};
declare module "express-session" {
  interface SessionData {
    user?: User;
  }
}
export const current = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Please sign in to continue." });
  next();
};
export const admin = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.user?.role !== "admin")
    return res.status(403).json({ error: "Administrator access required." });
  next();
};
export function authRoutes(app: Express) {
  app.post("/api/auth/register", (req, res) => {
    const { name, email, password } = req.body || {};
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 8
    )
      return res
        .status(400)
        .json({
          error:
            "Enter a name, valid email, and password of at least 8 characters.",
        });
    try {
      const r = db
        .prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)")
        .run(name.trim(), email.toLowerCase(), bcrypt.hashSync(password, 12));
      const user = {
        id: Number(r.lastInsertRowid),
        name: name.trim(),
        email: email.toLowerCase(),
        role: "customer" as const,
      };
      req.session.user = user;
      res.status(201).json(user);
    } catch {
      res
        .status(409)
        .json({ error: "An account with that email already exists." });
    }
  });
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body || {};
    const row = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(String(email || "").toLowerCase()) as any;
    if (!row || !bcrypt.compareSync(String(password || ""), row.password_hash))
      return res.status(401).json({ error: "Email or password is incorrect." });
    const user = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
    };
    req.session.regenerate((err) => {
      if (err)
        return res.status(500).json({ error: "Could not start session." });
      req.session.user = user;
      res.json(user);
    });
  });
  app.post("/api/auth/logout", (req, res) =>
    req.session.destroy(() => {
      res.clearCookie("everafter.sid");
      res.json({ ok: true });
    }),
  );
  app.get("/api/auth/me", (req, res) => res.json(req.session.user || null));
}
