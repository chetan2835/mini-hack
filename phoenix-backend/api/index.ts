import type { Request, Response } from "express";
import { createApp } from "../src/app";
import { getSettings } from "../src/config";
import { connectDb } from "../src/db";

let app: ReturnType<typeof createApp> | null = null;

export default async function handler(req: Request, res: Response) {
  const settings = getSettings();
  await connectDb(settings.MONGO_URL);
  if (!app) {
    app = createApp();
  }
  return app(req, res);
}
