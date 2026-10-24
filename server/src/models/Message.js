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

    // In 100% E2EE, readable user text only exists on client devices.
    // Database text is only used for system messages (e.g. "Alice added Bob")
    // and deleted message tombstones ("This message was deleted").
    text: {
      type: String,
      required: function () {
        return this.type === "system";
      },
      trim: true,
      default: "",
    },

    // Poll message metadata & encrypted votes.
    // Question and option labels are encrypted inside `e2ee`.
    poll: {
      options: [
        {
          _id: false,
          id: { type: String, required: true },
        },
      ],
      allowMultipleAnswers: { type: Boolean, default: false },
      votes: [
        {
          _id: false,
          userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
          iv: { type: String, required: true },
          ciphertext: { type: String, required: true },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
    },

    // True for an end-to-end encrypted message. Its contents are in `e2ee`.
    encrypted: { type: Boolean, default: true },
    e2ee: {
      v: Number,
      senderDeviceId: String,
      spk: String, // sender device's public key, as used for this message
      iv: String,
      ciphertext: String,
      // One locked copy of the message key per recipient device.
      keys: [
        {
          _id: false,
          userId: String,
          deviceId: String,
          epk: String,
          iv: String,
          wrapped: String,
        },
      ],
    },

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
          "creator-transferred",
          "creator-auto-transferred",
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

    // One entry per user. Sealed (iv + ciphertext) so only people who can
    // read the message can decrypt it.
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        iv: { type: String, required: true },
        ciphertext: { type: String, required: true },
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
