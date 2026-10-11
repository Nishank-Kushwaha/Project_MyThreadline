export function bytesToBase64Url(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
