import mongoose from "mongoose";

const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true },

    // "user" = a normal chat message, "system" = an event like "Carol left".
    // For system messages, `sender` is the person who did the action.
    type: { type: String, enum: ["user", "system"], default: "user" },

    // Only set when type is "system". Names are snapshotted so history still
    // reads correctly even if someone later renames themselves.
    system: {
      kind: {
        type: String,
        enum: [
          "group-created",
          "name-changed",
          "avatar-changed",
          "avatar-removed",
          "member-added",
          "member-removed",
          "member-promoted",
          "member-demoted",
          "member-left",
          "member-auto-promoted",
        ],
      },
      actorId: { type: Schema.Types.ObjectId, ref: "User" },
      actorName: String,
      targetId: { type: Schema.Types.ObjectId, ref: "User" },
      targetName: String,
      meta: { oldName: String, newName: String },
    },

    // Receipts are tracked PER RECIPIENT so they work for groups too.
    // The client derives the tick state:
    //   seenBy.length      >= recipients  -> seen      (✓✓ highlighted)
    //   deliveredTo.length >= recipients  -> delivered (✓✓)
    //   otherwise                         -> sent      (✓)
    deliveredTo: [{ type: Schema.Types.ObjectId, ref: "User" }],
    seenBy: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // One entry per user (never two for the same userId) — picking a new
    // emoji replaces the old entry rather than adding a second one.
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        emoji: { type: String, required: true },
      },
    ],

    // Timestamp of the most recent edit
    editedAt: {
      type: Date,
      default: null,
    },

    // Soft delete: preserve the message document and its position
    // "deletedAt" is what the client checks to render the "This message was deleted" placeholder.
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Message", messageSchema);
