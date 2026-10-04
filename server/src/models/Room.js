import mongoose from "mongoose";

const { Schema } = mongoose;

const roomSchema = new Schema(
  {
    type: { type: String, enum: ["private", "group"], required: true },
    name: { type: String, trim: true }, // only used for "group" rooms
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // only used for "group" rooms
    groupAvatarUrl: { type: String, default: "" },
    groupAvatarPublicId: { type: String, default: "" },
    members: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        isAdmin: { type: Boolean, default: false },
        joinedAt: { type: Date }, // set explicitly when someone joins a group
        unreadCount: { type: Number, default: 0 },
        lastReadMessageId: {
          type: Schema.Types.ObjectId,
          ref: "Message",
          default: null,
        },
      },
    ],
    lastMessage: {
      messageId: { type: Schema.Types.ObjectId, ref: "Message" },
      text: String,
      sender: { type: Schema.Types.ObjectId, ref: "User" },
      createdAt: Date,
      system: Schema.Types.Mixed, // only set when the last message is a group event
    },
  },
  { timestamps: true },
);

roomSchema.index({ "members.userId": 1 });

export default mongoose.model("Room", roomSchema);
