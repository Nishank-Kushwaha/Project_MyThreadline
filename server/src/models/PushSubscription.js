import mongoose from "mongoose";

const { Schema } = mongoose;

// One row per browser/device that agreed to receive pushes. The endpoint is
// unique: a browser has exactly one subscription at a time, so if a different
// person logs in on the same browser it is re-pointed to them (see saveSubscription).
const pushSubscriptionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true },
);

export default mongoose.model("PushSubscription", pushSubscriptionSchema);
