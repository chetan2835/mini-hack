import { afterAll, beforeAll } from "vitest";

process.env.JWT_SECRET ??= "test-secret-that-is-at-least-32-bytes-long";

beforeAll(async () => {
  const { connectDb } = await import("../src/db");
  await connectDb(process.env.MONGODB_URI || process.env.MONGO_URL || "mongodb://localhost:27017/phoenix_test");
});

afterAll(async () => {
  const { disconnectDb } = await import("../src/db");
  await disconnectDb();
});
