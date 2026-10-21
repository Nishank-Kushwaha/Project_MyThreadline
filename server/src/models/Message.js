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

    // Empty for end-to-end encrypted messages: the readable text only ever
    // exists on the devices.
    text: {
      type: String,
      required: function () {
        return !this.encrypted && !this.media?.url;
      },
      trim: true,
      default: "",
    },

    // Unencrypted media attachments (used only in non-E2EE chats).
    // In E2EE chats, all media metadata and keys are encrypted inside `e2ee`.
    media: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
      fileName: { type: String, default: "" },
      fileType: { type: String, default: "" },
      fileSize: { type: Number, default: 0 },
    },

    // True for an end-to-end encrypted message. Its contents are in `e2ee`.
    encrypted: { type: Boolean, default: false },
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

    // One entry per user (never two for the same userId) — picking a new
    // emoji replaces the old entry rather than adding a second one.
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        // Plain messages store the emoji itself. Encrypted messages store it
        // sealed (iv + ciphertext): only people who can read the message can
        // open it.
        emoji: {
          type: String,
          required: function () {
            return !this.ciphertext;
          },
        },
        iv: String,
        ciphertext: String,
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

    // Quoted reply context (WhatsApp style)
    replyTo: {
      messageId: { type: Schema.Types.ObjectId, ref: "Message" },
      senderName: { type: String, default: "" },
      text: { type: String, default: "" },
      mediaType: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

export default mongoose.model("Message", messageSchema);
