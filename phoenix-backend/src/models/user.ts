import { Schema, type InferSchemaType } from "mongoose";

export const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: import("mongoose").Types.ObjectId };
