import mongoose from "mongoose";
import { CreditLedger, Project, Task, User, Workspace, WorkspaceMember } from "./models";

mongoose.set("strictQuery", true);
mongoose.set("autoIndex", true);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_MODELS: mongoose.Model<any>[] = [User, Workspace, WorkspaceMember, Project, Task, CreditLedger];

export async function connectDb(uri?: string): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  const targetUri = uri || (await import("./config")).getSettings().MONGO_URL;
  await mongoose.connect(targetUri);
  await Promise.all(ALL_MODELS.map((m) => m.init()));
  await Promise.all(ALL_MODELS.map((m) => m.syncIndexes().catch(() => {})));
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
