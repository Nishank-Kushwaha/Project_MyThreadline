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
  },
  { timestamps: true },
);

export default mongoose.model("Message", messageSchema);
