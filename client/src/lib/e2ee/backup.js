import { base64UrlToBytes, bytesToBase64Url } from "./encoding";
import { clearIdentityCache, getIdentity } from "./identity";
import {
  getBackupPin,
  getDeviceKeyRecord,
  saveBackupPin,
  saveDeviceKeyRecord,
  saveHistoryKey,
} from "./keyStore";
import {
  addBackupEntryRequest,
  changeBackupPassphraseRequest,
  createBackupRequest,
  getBackupRequest,
} from "@/api/keysApi";

const encoder = new TextEncoder();
const CURVE = { name: "ECDH", namedCurve: "P-256" };

// Web Crypto offers PBKDF2 only. The count is the OWASP figure for SHA-256.
const PBKDF2_ITERATIONS = 600_000;
const MIN_PASSPHRASE_LENGTH = 12;

const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

const withLock = (userId, work) =>
  navigator.locks?.request
    ? navigator.locks.request(`threadline-e2ee:${userId}`, work)
    : work();

// ---------- Passphrases ----------

// 32 symbols without 0/O/1/I. 256 is divisible by 32, so every symbol is
// equally likely. 20 symbols = 100 bits.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassphrase() {
  const chars = [...randomBytes(20)].map((b) => ALPHABET[b % 32]).join("");
  return chars.match(/.{5}/g).join("-");
}

// A simple guide, not a guarantee: it can't know every weak passphrase.
export function checkPassphrase(passphrase) {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      level: 0,
      label: `Use at least ${MIN_PASSPHRASE_LENGTH} characters`,
    };
  }
  if (
    new Set(passphrase).size < 5 ||
    /password|123456|qwerty|letmein|abcdef/i.test(passphrase)
  ) {
    return { ok: false, level: 0, label: "Too easy to guess" };
  }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) =>
    r.test(passphrase),
  ).length;

  if (passphrase.length >= 20 || (passphrase.length >= 16 && classes >= 3)) {
    return { ok: true, level: 3, label: "Strong" };
  }
  if (passphrase.length >= 14 || classes >= 3) {
    return { ok: true, level: 2, label: "Good" };
  }
  return { ok: true, level: 1, label: "Okay, but longer is safer" };
}

async function deriveBackupKey(passphrase, kdf) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToBytes(kdf.salt),
      iterations: kdf.iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---------- Sealing a secret to a public key (one-way box) ----------

async function ecdh(privateKey, publicKey) {
  const key = await crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(publicKey),
    CURVE,
    false,
    [],
  );

  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: key },
      privateKey,
      256,
    ),
  );
}

async function sealingKey(shared, label) {
  const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode(label),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// `context` names what's being sealed and who it belongs to, so a sealed blob
// can't be moved to another device or user.
async function seal(plaintext, recipientPublicKey, context) {
  const ephemeral = await crypto.subtle.generateKey(CURVE, false, [
    "deriveBits",
  ]);

  const epk = bytesToBase64Url(
    new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey)),
  );

  const key = await sealingKey(
    await ecdh(ephemeral.privateKey, recipientPublicKey),
    `threadline-e2ee/v1/backup-seal|${context}|${epk}`,
  );

  const iv = randomBytes(12);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    key,
    plaintext,
  );

  return {
    epk,
    iv: bytesToBase64Url(iv),
    sealed: bytesToBase64Url(new Uint8Array(sealed)),
  };
}

async function openSealed({ epk, iv, sealed }, recipientPrivateKey, context) {
  const key = await sealingKey(
    await ecdh(recipientPrivateKey, epk),
    `threadline-e2ee/v1/backup-seal|${context}|${epk}`,
  );

  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(iv),
        additionalData: encoder.encode(context),
      },
      key,
      base64UrlToBytes(sealed),
    ),
  );
}

// ---------- Keys <-> bytes ----------

// A private key's public half, from its JWK, as the same base64url string the
// server and the key directory use.
function publicKeyFromJwk(jwk) {
  const x = base64UrlToBytes(jwk.x);
  const y = base64UrlToBytes(jwk.y);

  if (x.length !== 32 || y.length !== 32)
    throw new Error("Unexpected key format");

  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(x, 1);
  raw.set(y, 33);

  return bytesToBase64Url(raw);
}

// Imports private-key bytes and checks they belong to `expectedPublicKey`.
async function importVerifiedPrivateKey(pkcs8, expectedPublicKey, extractable) {
  const probe = await crypto.subtle.importKey("pkcs8", pkcs8, CURVE, true, [
    "deriveBits",
  ]);

  const actual = publicKeyFromJwk(await crypto.subtle.exportKey("jwk", probe));
  if (actual !== expectedPublicKey) throw new Error("The key doesn't match");

  return extractable
    ? probe
    : crypto.subtle.importKey("pkcs8", pkcs8, CURVE, false, ["deriveBits"]);
}

const backupAad = (userId, publicKey) =>
  encoder.encode(`threadline-e2ee/v1/backup-key|${userId}|${publicKey}`);

async function wrapBackupPrivateKey({ userId, publicKey, pkcs8, passphrase }) {
  const kdf = {
    name: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64Url(randomBytes(16)),
  };

  const key = await deriveBackupKey(passphrase, kdf);
  const iv = randomBytes(12);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: backupAad(userId, publicKey) },
    key,
    pkcs8,
  );

  return {
    kdf,
    wrapped: {
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    },
  };
}

async function unwrapBackupPrivateKey(userId, backup, passphrase) {
  const key = await deriveBackupKey(passphrase, backup.kdf);

  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64UrlToBytes(backup.wrapped.iv),
          additionalData: backupAad(userId, backup.publicKey),
        },
        key,
        base64UrlToBytes(backup.wrapped.ciphertext),
      ),
    );
  } catch {
    throw new Error("That passphrase doesn't match.");
  }
}

// This device's key as a sealed backup entry.
async function sealDeviceKey({ userId, identity, backupPublicKey }) {
  let pkcs8;

  try {
    pkcs8 = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", identity.privateKey),
    );
  } catch {
    throw new Error(
      "This device's key can't be exported, so it can't be added to the backup.",
    );
  }

  try {
    const sealed = await seal(
      pkcs8,
      backupPublicKey,
      `device|${userId}|${identity.deviceId}|${identity.publicKey}`,
    );

    return {
      deviceId: identity.deviceId,
      publicKey: identity.publicKey,
      ...sealed,
    };
  } finally {
    pkcs8.fill(0);
  }
}

// Once the key is safely in the backup it no longer needs to be exportable, so
// it is re-saved as non-extractable: scripts in the page can use it but can no
// longer read it.
async function hardenDeviceKey(userId) {
  const record = await getDeviceKeyRecord(userId);
  if (!record) return;

  let pkcs8;

  try {
    pkcs8 = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", record.privateKey),
    );
  } catch {
    return; // already non-extractable
  }

  try {
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      CURVE,
      false,
      ["deriveBits"],
    );

    await saveDeviceKeyRecord({ ...record, privateKey });
    clearIdentityCache();
  } finally {
    pkcs8.fill(0);
  }
}

// ---------- What the UI calls ----------

// -> { phase: "none" | "restore" | "changed" | "on", summary }
export async function getBackupStatus(userId) {
  const { data } = await getBackupRequest();
  const backup = data.backup;

  if (!backup) return { phase: "none" };

  const identity = await getIdentity(userId);
  const pin = await getBackupPin(userId);

  const summary = {
    updatedAt: backup.updatedAt,
    devices: backup.entries.length,
    thisDeviceIncluded: backup.entries.some(
      (entry) => entry.publicKey === identity.publicKey,
    ),
  };

  if (!pin) return { phase: "restore", summary };
  if (pin.publicKey !== backup.publicKey) return { phase: "changed", summary };

  return { phase: "on", summary };
}

export function createBackup({ userId, passphrase }) {
  return withLock(userId, async () => {
    if (!checkPassphrase(passphrase).ok) {
      throw new Error("Choose a stronger passphrase.");
    }

    const identity = await getIdentity(userId);

    const pair = await crypto.subtle.generateKey(CURVE, true, ["deriveBits"]);
    const publicKey = bytesToBase64Url(
      new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
    );

    const pkcs8 = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", pair.privateKey),
    );

    try {
      const { kdf, wrapped } = await wrapBackupPrivateKey({
        userId,
        publicKey,
        pkcs8,
        passphrase,
      });

      const entry = await sealDeviceKey({
        userId,
        identity,
        backupPublicKey: publicKey,
      });

      await createBackupRequest({ publicKey, kdf, wrapped, entry });
    } finally {
      pkcs8.fill(0);
    }

    // This browser now trusts this backup key, and its own key is saved in it.
    await saveBackupPin({ userId, publicKey, pinnedAt: Date.now() });
    await hardenDeviceKey(userId);
  });
}

// Opens the backup with the passphrase, adds this device's key to it, and
// saves every older device key here so old messages can be read.
export function restoreBackup({ userId, passphrase }) {
  return withLock(userId, async () => {
    const { data } = await getBackupRequest();
    const backup = data.backup;

    if (!backup) throw new Error("There's no backup to restore.");

    const pkcs8 = await unwrapBackupPrivateKey(userId, backup, passphrase);
    let backupPrivateKey;

    try {
      backupPrivateKey = await importVerifiedPrivateKey(
        pkcs8,
        backup.publicKey,
        false,
      );
    } catch {
      throw new Error("This backup is damaged.");
    } finally {
      pkcs8.fill(0);
    }

    // Add THIS device, so messages sent from now on are recoverable too.
    const identity = await getIdentity(userId);

    if (!backup.entries.some((e) => e.publicKey === identity.publicKey)) {
      const entry = await sealDeviceKey({
        userId,
        identity,
        backupPublicKey: backup.publicKey,
      });

      await addBackupEntryRequest(entry);
    }

    // Older devices' keys, opened one by one. A bad entry is skipped.
    let restored = 0;

    for (const entry of backup.entries) {
      if (entry.publicKey === identity.publicKey) continue; // already in use

      let bytes;

      try {
        bytes = await openSealed(
          entry,
          backupPrivateKey,
          `device|${userId}|${entry.deviceId}|${entry.publicKey}`,
        );

        const privateKey = await importVerifiedPrivateKey(
          bytes,
          entry.publicKey,
          false,
        );

        await saveHistoryKey({
          id: `${userId}:${entry.publicKey}`,
          userId,
          deviceId: entry.deviceId,
          publicKey: entry.publicKey,
          privateKey,
          restoredAt: Date.now(),
        });

        restored += 1;
      } catch {
        // wrong context, tampered, or not matching its public key: skip it
      } finally {
        bytes?.fill(0);
      }
    }

    await saveBackupPin({
      userId,
      publicKey: backup.publicKey,
      pinnedAt: Date.now(),
    });
    await hardenDeviceKey(userId);
    clearIdentityCache();

    return { restored };
  });
}

export async function changeBackupPassphrase({
  userId,
  oldPassphrase,
  newPassphrase,
}) {
  if (!checkPassphrase(newPassphrase).ok) {
    throw new Error("Choose a stronger passphrase.");
  }

  const { data } = await getBackupRequest();
  const backup = data.backup;

  if (!backup) throw new Error("There's no backup yet.");

  // Opening the old blob proves the old passphrase is right.
  const pkcs8 = await unwrapBackupPrivateKey(userId, backup, oldPassphrase);

  try {
    const { kdf, wrapped } = await wrapBackupPrivateKey({
      userId,
      publicKey: backup.publicKey,
      pkcs8,
      passphrase: newPassphrase,
    });

    await changeBackupPassphraseRequest({ kdf, wrapped });
  } finally {
    pkcs8.fill(0);
  }
}
