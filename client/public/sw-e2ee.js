// Decrypts the end-to-end encrypted part of a push inside the service worker.
// Mirrors src/lib/e2ee/crypto.js (format v1): keep the two in sync.
(() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const CURVE = { name: "ECDH", namedCurve: "P-256" };
  const DB_NAME = "threadline-e2ee";
  const STORE = "deviceKeys";

  function base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  }

  function concat(...parts) {
    const out = new Uint8Array(parts.reduce((total, p) => total + p.length, 0));
    let offset = 0;

    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }

    return out;
  }

  // Reads this device's key record. If the database doesn't exist yet the open
  // is aborted: creating an empty one here would stop the app from setting up
  // its own store later.
  function loadKeyRecord(userId) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const db = request.result;

        try {
          const get = db
            .transaction(STORE, "readonly")
            .objectStore(STORE)
            .get(userId);

          get.onsuccess = () => {
            db.close();
            resolve(get.result);
          };
          get.onerror = () => {
            db.close();
            reject(get.error);
          };
        } catch (err) {
          db.close();
          reject(err);
        }
      };
    });
  }

  async function ecdh(privateKey, publicKey) {
    const key = await crypto.subtle.importKey(
      "raw",
      base64UrlToBytes(publicKey),
      CURVE,
      false,
      [],
    );

    const bits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: key },
      privateKey,
      256,
    );

    return new Uint8Array(bits);
  }

  async function deriveWrapKey(dh1, dh2, info) {
    const material = await crypto.subtle.importKey(
      "raw",
      concat(dh1, dh2),
      "HKDF",
      false,
      ["deriveKey"],
    );

    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  // Returns the decrypted message text, or null for any reason it can't.
  self.decryptPushPreview = async function ({
    envelope,
    userId,
    senderId,
    roomId,
  }) {
    try {
      if (!envelope || envelope.v !== 1 || !roomId) return null;

      const record = await loadKeyRecord(userId);
      if (!record?.privateKey) return null;

      const entry = envelope.keys.find(
        (key) => key.userId === userId && key.deviceId === record.deviceId,
      );
      if (!entry) return null;

      const dh1 = await ecdh(record.privateKey, entry.epk);
      const dh2 = await ecdh(record.privateKey, envelope.spk);

      const info = encoder.encode(
        `threadline-e2ee/v1/wrap|${roomId}|${senderId}|${envelope.senderDeviceId}|${envelope.spk}|${userId}|${record.deviceId}|${entry.epk}`,
      );

      const wrapKey = await deriveWrapKey(dh1, dh2, info);

      const messageKeyBytes = new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: base64UrlToBytes(entry.iv),
            additionalData: info,
          },
          wrapKey,
          base64UrlToBytes(entry.wrapped),
        ),
      );

      try {
        const messageKey = await crypto.subtle.importKey(
          "raw",
          messageKeyBytes,
          "AES-GCM",
          false,
          ["decrypt"],
        );

        const plaintext = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: base64UrlToBytes(envelope.iv),
            additionalData: encoder.encode(
              `threadline-e2ee/v1/body|${roomId}|${senderId}|${envelope.senderDeviceId}`,
            ),
          },
          messageKey,
          base64UrlToBytes(envelope.ciphertext),
        );

        const text = JSON.parse(decoder.decode(plaintext))?.text;
        return typeof text === "string" && text ? text : null;
      } finally {
        messageKeyBytes.fill(0);
      }
    } catch {
      return null;
    }
  };
})();
