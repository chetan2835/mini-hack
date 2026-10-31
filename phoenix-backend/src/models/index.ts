import mongoose from "mongoose";
import { userSchema } from "./user";

const userWithVirtuals = userSchema.clone();
userWithVirtuals.virtual("displayName").get(function () {
  return this.fullName || this.email;
});

export const User = mongoose.model("User", userWithVirtuals);
export { Workspace, WorkspaceMember, ROLES } from "./workspace";
export { Project } from "./project";
export { Task, TASK_STATUSES } from "./task";
export { CreditLedger } from "./ledger";
