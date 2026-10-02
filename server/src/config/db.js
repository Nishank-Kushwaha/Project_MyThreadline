import mongoose from "mongoose";
import env from "./env.js";

async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri);
    console.log("[db] MongoDB connected");
  } catch (err) {
    console.error("[db] MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

export default connectDB;
