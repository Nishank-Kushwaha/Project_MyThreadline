const encoder = new TextEncoder();

// 30 digits (about 100 bits) that stand for one person's current device keys.
// Only the public keys are used, in sorted order, so every device computes the
// same result.
async function userDigits(userId, devices) {
  const keys = devices.map((device) => device.publicKey).sort();

  const hash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`threadline-e2ee/v1/safety|${userId}|${keys.join("|")}`),
    ),
  );

  let digits = "";

  // Six chunks of 5 bytes (40 bits), each turned into 5 digits.
  for (let chunk = 0; chunk < 6; chunk += 1) {
    let value = 0;
    for (let i = 0; i < 5; i += 1) value = value * 256 + hash[chunk * 5 + i];
    digits += String(value % 100000).padStart(5, "0");
  }

  return digits;
}

// 60 digits, identical for both people: the two halves are ordered by user id,
// not by who is looking.
export async function computeSafetyNumber({
  myId,
  myDevices,
  theirId,
  theirDevices,
}) {
  const [first, second] = [
    { id: myId, devices: myDevices },
    { id: theirId, devices: theirDevices },
  ].sort((a, b) => (a.id < b.id ? -1 : 1));

  return (
    (await userDigits(first.id, first.devices)) +
    (await userDigits(second.id, second.devices))
  );
}

// "12345 67890 ..."
export const formatSafetyNumber = (digits) =>
  digits.match(/.{5}/g)?.join(" ") ?? "";

// What a QR code scanner shows as text.
export const safetyQrText = (digits) => `threadline-verify:v1:${digits}`;

// Accepts the number as typed or pasted (spaces, dashes) or the QR text.
export function parseSafetyNumber(input) {
  return input.replace(/^\s*threadline-verify:v1:/i, "").replace(/\D/g, "");
}
