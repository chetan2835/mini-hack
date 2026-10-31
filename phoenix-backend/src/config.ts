import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  MONGO_URL: z.string().regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),
  JWT_SECRET: z.string().min(8, "JWT_SECRET must be at least 8 characters"),
  JWT_ALGORITHM: z.enum(["HS256", "HS384", "HS512"]).default("HS256"),
  JWT_EXPIRE_MINUTES: z.coerce.number().int().positive().default(120),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  TASK_CREDIT_COST: z.coerce.number().int().positive().default(1),
  WELCOME_CREDITS: z.coerce.number().int().nonnegative().default(3),
  APP_VERSION: z.string().default("dev"),
  PORT: z.coerce.number().int().default(8000),
});

export type Settings = z.infer<typeof EnvSchema> & { corsOriginList: string[] };

let cached: Settings | null = null;

function parseCorsOrigins(raw: string): string[] {
  if (raw.startsWith("[")) {
    try {
      return JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function getSettings(): Settings {
  if (cached) return cached;
  const envToParse = {
    ...process.env,
    MONGO_URL: process.env.MONGO_URL || process.env.MONGODB_URI || process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET || process.env.SECRET_KEY,
    APP_VERSION: process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  };
  const parsed = EnvSchema.safeParse(envToParse);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
  }
  cached = {
    ...parsed.data,
    corsOriginList: parseCorsOrigins(parsed.data.CORS_ORIGINS),
  };
  return cached;
}
