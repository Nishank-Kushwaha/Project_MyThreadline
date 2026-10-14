// This browser's keys live here, in IndexedDB, and nowhere else. IndexedDB can
// store CryptoKey objects directly.
const DB_NAME = "threadline-e2ee";
const DB_VERSION = 2;

const DEVICE_KEYS = "deviceKeys"; // this device's key pair
const BACKUP_PINS = "backupPins"; // the backup public key this browser verified
const HISTORY_KEYS = "historyKeys"; // keys of older devices, restored from the backup

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (event.oldVersion < 1) {
        db.createObjectStore(DEVICE_KEYS, { keyPath: "userId" });
      }

      if (event.oldVersion < 2) {
        db.createObjectStore(BACKUP_PINS, { keyPath: "userId" });
        db.createObjectStore(HISTORY_KEYS, { keyPath: "id" }).createIndex(
          "userId",
          "userId",
        );
      }
    };
    request.onblocked = () =>
      console.warn("[e2ee] close other tabs of the app to finish an update");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(storeName, mode, action) {
  const db = await openDb();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));

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
  run(DEVICE_KEYS, "readonly", (store) => store.get(userId));

export const saveDeviceKeyRecord = (record) =>
  run(DEVICE_KEYS, "readwrite", (store) => store.put(record));

export const deleteDeviceKeyRecord = (userId) =>
  run(DEVICE_KEYS, "readwrite", (store) => store.delete(userId));

// { userId, publicKey, pinnedAt }
export const getBackupPin = (userId) =>
  run(BACKUP_PINS, "readonly", (store) => store.get(userId));

export const saveBackupPin = (pin) =>
  run(BACKUP_PINS, "readwrite", (store) => store.put(pin));

// { id, userId, deviceId, publicKey, privateKey: CryptoKey, restoredAt }
export const listHistoryKeys = (userId) =>
  run(HISTORY_KEYS, "readonly", (store) =>
    store.index("userId").getAll(userId),
  );

export const saveHistoryKey = (record) =>
  run(HISTORY_KEYS, "readwrite", (store) => store.put(record));
