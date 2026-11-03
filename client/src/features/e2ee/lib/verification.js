// What this browser remembers about contacts the user has verified. Only
// public keys are stored, so localStorage is fine.
const PREFIX = "threadline:verified";
const EVENT = "threadline:verification-changed";

const storageKey = (me, contact) => `${PREFIX}:${me}:${contact}`;

function read(me, contact) {
  try {
    const raw = localStorage.getItem(storageKey(me, contact));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveVerification(me, contact, devices) {
  try {
    localStorage.setItem(
      storageKey(me, contact),
      JSON.stringify({
        verifiedAt: Date.now(),
        devices: devices.map(({ deviceId, publicKey }) => ({
          deviceId,
          publicKey,
        })),
      }),
    );
  } catch {
    // storage unavailable: it just isn't remembered
  }

  window.dispatchEvent(new Event(EVENT));
}

export function removeVerification(me, contact) {
  try {
    localStorage.removeItem(storageKey(me, contact));
  } catch {
    // nothing to do
  }

  window.dispatchEvent(new Event(EVENT));
}

// -> { state: "unverified" }
//  | { state: "verified", verifiedAt }
//  | { state: "changed", verifiedAt, added: [...], replaced: [...] }
//
// A key this browser hasn't seen is a change: either a new device (added) or a
// device whose key was swapped (replaced). A device that disappeared is not a
// risk, so it doesn't count.
export function getVerificationStatus(me, contact, currentDevices) {
  const saved = read(me, contact);
  if (!saved) return { state: "unverified" };

  const knownKeys = new Set(saved.devices.map((d) => d.publicKey));
  const knownIds = new Set(saved.devices.map((d) => d.deviceId));

  const unseen = currentDevices.filter((d) => !knownKeys.has(d.publicKey));

  if (unseen.length === 0) {
    return { state: "verified", verifiedAt: saved.verifiedAt };
  }

  return {
    state: "changed",
    verifiedAt: saved.verifiedAt,
    replaced: unseen.filter((d) => knownIds.has(d.deviceId)),
    added: unseen.filter((d) => !knownIds.has(d.deviceId)),
  };
}

// Calls back when anything verified changes, in this tab or another.
export function subscribeVerification(callback) {
  const onStorage = (event) => {
    if (!event.key || event.key.startsWith(PREFIX)) callback();
  };

  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}
