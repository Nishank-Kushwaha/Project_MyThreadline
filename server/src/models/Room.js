import mongoose from "mongoose";

const { Schema } = mongoose;

const roomSchema = new Schema(
  {
    type: { type: String, enum: ["private", "group"], required: true },
    name: { type: String, trim: true }, // only used for "group" rooms
    groupAvatarUrl: { type: String, default: "" },
    groupAvatarPublicId: { type: String, default: "" },
    members: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        isAdmin: { type: Boolean, default: false },
        unreadCount: { type: Number, default: 0 },
        lastReadMessageId: {
          type: Schema.Types.ObjectId,
          ref: "Message",
          default: null,
        },
      },
    ],
    lastMessage: {
      text: String,
      sender: { type: Schema.Types.ObjectId, ref: "User" },
      createdAt: Date,
    },
  },
  { timestamps: true },
);

roomSchema.index({ "members.userId": 1 });

export default mongoose.model("Room", roomSchema);
