import mongoose from "mongoose";
import "../config/env.js";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import { sendToUser } from "../modules/push/push.service.js";

const identifier = process.argv[2];

if (!identifier) {
  console.error("Usage: node src/scripts/sendTestPush.js <email|userId>");
  process.exit(1);
}

await connectDB();

const user = identifier.includes("@")
  ? await User.findOne({ email: identifier.toLowerCase() })
  : await User.findById(identifier);

if (!user) {
  console.error("User not found");
  process.exit(1);
}

const result = await sendToUser(user._id.toString(), {
  title: "Threadline",
  body: "Test push from the server",
  tag: "test",
  data: { roomId: null },
});

console.log("Result:", result);

await mongoose.disconnect();
