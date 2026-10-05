import webpush from "web-push";
import env from "../../config/env.js";
import PushSubscription from "../../models/PushSubscription.js";
import ApiError from "../../utils/ApiError.js";

// A push that can't be delivered within a day is no longer worth showing.
const PUSH_TTL_SECONDS = 60 * 60 * 24;

// The server will POST to whatever endpoint a client registers, so only accept
// the push services real browsers use (Chrome/Edge/Opera/Brave, Firefox,
// Safari, Windows).
const ALLOWED_PUSH_HOSTS = [
  /(^|\.)googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

const isConfigured = Boolean(
  env.vapid.publicKey && env.vapid.privateKey && env.vapid.subject,
);

if (isConfigured) {
  webpush.setVapidDetails(
    env.vapid.subject,
    env.vapid.publicKey,
    env.vapid.privateKey,
  );
} else {
  console.warn("[push] VAPID keys missing in .env, push is disabled");
}

function isAllowedEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      ALLOWED_PUSH_HOSTS.some((pattern) => pattern.test(url.hostname))
    );
  } catch {
    return false;
  }
}

function getPublicKey() {
  if (!isConfigured) {
    throw new ApiError(503, "Push notifications aren't set up on the server");
  }
  return env.vapid.publicKey;
}

// Called after login or whenever the browser (re)subscribes.
async function saveSubscription(userId, subscription) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (typeof endpoint !== "string" || !p256dh || !auth) {
    throw new ApiError(400, "Invalid push subscription");
  }

  if (!isAllowedEndpoint(endpoint)) {
    throw new ApiError(400, "Unsupported push service");
  }

  // Upsert by endpoint: same browser, new account => the row moves to them.
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId, keys: { p256dh, auth } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

// Only the owner can remove their own subscription.
async function removeSubscription(userId, endpoint) {
  await PushSubscription.deleteOne({ userId, endpoint });
}

// Sends one payload to every device the user has subscribed. Subscriptions the
// push service reports as gone (404/410) are deleted. Never throws on a
// delivery failure; callers still wrap it in try/catch for database errors.
async function sendToUser(userId, payload) {
  const result = { sent: 0, removed: 0, failed: 0 };

  if (!isConfigured) return result;

  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (subscriptions.length === 0) return result;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body,
          { TTL: PUSH_TTL_SECONDS, urgency: "high" },
        );
        result.sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          result.removed += 1;
        } else {
          result.failed += 1;
          console.error("[push] send failed:", err.statusCode, err.message);
        }
      }
    }),
  );

  return result;
}

export { getPublicKey, saveSubscription, removeSubscription, sendToUser };
