import { base64UrlToBytes, bytesToBase64Url } from "./encoding";

// In-memory cache for decrypted object URLs: avoids re-downloading & re-decrypting
// the same media on re-renders or scroll events.
const decryptedCache = new Map(); // `${url}:${iv}` -> objectUrl

const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

/**
 * Encrypts a File client-side using AES-GCM (256-bit key).
 * Returns the encrypted binary blob to be uploaded, plus the encryption metadata (key, iv, etc.)
 * to be placed inside the E2EE envelope.
 */
export async function encryptMedia(file) {
  const mediaKeyBytes = randomBytes(32);
  const ivBytes = randomBytes(12);

  try {
    const mediaKey = await crypto.subtle.importKey(
      "raw",
      mediaKeyBytes,
      "AES-GCM",
      false,
      ["encrypt"],
    );

    const fileBuffer = await file.arrayBuffer();

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: ivBytes,
      },
      mediaKey,
      fileBuffer,
    );

    const encryptedBlob = new Blob([ciphertext], {
      type: "application/octet-stream",
    });

    return {
      encryptedBlob,
      mediaKey: bytesToBase64Url(mediaKeyBytes),
      mediaIv: bytesToBase64Url(ivBytes),
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
    };
  } finally {
    mediaKeyBytes.fill(0); // clear sensitive key bytes from memory
  }
}

/**
 * Downloads an encrypted media file and decrypts it with AES-GCM.
 * Resolves to a browser object URL (blob:...) that can be passed to <img src> or <a> download.
 */
export async function decryptMedia({ url, key, iv, fileType, fileName }) {
  if (!url) throw new Error("No URL provided for media decryption");
  if (!key || !iv) throw new Error("Decryption key or IV missing for media");

  const cacheKey = `${url}:${iv}`;
  if (decryptedCache.has(cacheKey)) {
    return decryptedCache.get(cacheKey);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download encrypted media (${response.status})`);
  }

  const encryptedBuffer = await response.arrayBuffer();
  const mediaKeyBytes = base64UrlToBytes(key);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      mediaKeyBytes,
      "AES-GCM",
      false,
      ["decrypt"],
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(iv),
      },
      cryptoKey,
      encryptedBuffer,
    );

    let mime = fileType;
    const lowerName = (fileName || "").toLowerCase();
    if (!mime || mime === "application/octet-stream") {
      if (lowerName.endsWith(".pdf")) mime = "application/pdf";
      else if (lowerName.endsWith(".png")) mime = "image/png";
      else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg"))
        mime = "image/jpeg";
      else if (lowerName.endsWith(".webp")) mime = "image/webp";
      else if (lowerName.endsWith(".gif")) mime = "image/gif";
      else if (lowerName.endsWith(".txt")) mime = "text/plain";
      else if (lowerName.endsWith(".json")) mime = "application/json";
      else mime = "application/octet-stream";
    }

    const blob = new Blob([decryptedBuffer], {
      type: mime,
    });

    const objectUrl = URL.createObjectURL(blob);
    decryptedCache.set(cacheKey, objectUrl);
    return objectUrl;
  } finally {
    mediaKeyBytes.fill(0);
  }
}

/**
 * Formats byte size into human-readable string (e.g. "1.2 MB")
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i] || "B"}`;
}
