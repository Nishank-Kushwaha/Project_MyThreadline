import mongoose from "mongoose";

const { Schema } = mongoose;

// One row per (user, browser). Holds ONLY the public key: the private key is
// created in the browser and never leaves it.
const deviceKeySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deviceId: { type: String, required: true },

    // Raw uncompressed ECDH P-256 public key, base64url (65 bytes decoded).
    publicKey: { type: String, required: true },

    // Names the key format, so other curves can be added later.
    algorithm: { type: String, enum: ["ecdh-p256"], default: "ecdh-p256" },

    // Bumped whenever this device's key CHANGES (not on a plain re-publish of
    // the same key). Phase 7 uses it for "security code changed" warnings.
    keyVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);

deviceKeySchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export default mongoose.model("DeviceKey", deviceKeySchema);
