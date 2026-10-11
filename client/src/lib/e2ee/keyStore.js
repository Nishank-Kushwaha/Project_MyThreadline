// The device's private key lives here, in this browser's IndexedDB, and
// nowhere else. IndexedDB can store a CryptoKey object directly.
const DB_NAME = "threadline-e2ee";
const STORE = "deviceKeys";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "userId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));

      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

// { userId, deviceId, privateKey: CryptoKey, publicKey: base64url, createdAt }
export const getDeviceKeyRecord = (userId) =>
  run("readonly", (store) => store.get(userId));

export const saveDeviceKeyRecord = (record) =>
  run("readwrite", (store) => store.put(record));

export const deleteDeviceKeyRecord = (userId) =>
  run("readwrite", (store) => store.delete(userId));
