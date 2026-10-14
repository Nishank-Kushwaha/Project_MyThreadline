import mongoose from "mongoose";

const { Schema } = mongoose;

// One per user. Everything here is useless without the user's backup
// passphrase, which never reaches the server.
const keyBackupSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // The backup key pair's PUBLIC half (raw P-256, base64url).
    publicKey: { type: String, required: true },

    // How the passphrase is stretched into a key.
    kdf: { name: String, iterations: Number, salt: String },

    // The backup key pair's private half, encrypted with the passphrase key.
    wrapped: { iv: String, ciphertext: String },

    // One per device key: that key's private half, sealed to `publicKey`.
    entries: [
      {
        _id: false,
        deviceId: String,
        publicKey: String, // the DEVICE key's public half
        epk: String,
        iv: String,
        sealed: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("KeyBackup", keyBackupSchema);
