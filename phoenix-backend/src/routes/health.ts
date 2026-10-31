import { Request, Response, Router } from "express";
import mongoose from "mongoose";
import { getSettings } from "../config";

export const healthRouter = Router();

const handleHealth = async (_req: Request, res: Response) => {
  const isDbReady = mongoose.connection.readyState === 1;
  if (!isDbReady) {
    res.status(503).json({ status: "error", version: getSettings().APP_VERSION, db: "down" });
    return;
  }
  try {
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
    }
    res.json({ status: "ok", version: getSettings().APP_VERSION, db: "ok" });
  } catch {
    res.status(503).json({ status: "error", version: getSettings().APP_VERSION, db: "error" });
  }
};

healthRouter.get("/api/health", handleHealth);
healthRouter.get("/health", handleHealth);
