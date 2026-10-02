import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, select: false }, // never returned by default queries
    googleId: { type: String, default: null },
    avatarUrl: { type: String, default: "" },
    avatarPublicId: { type: String, default: "" },
    status: { type: String, enum: ["online", "offline"], default: "offline" },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

userSchema.pre("validate", function () {
  if (!this.password && !this.googleId) {
    throw new Error("User must have either a password or a googleId");
  }
});

export default mongoose.model("User", userSchema);
