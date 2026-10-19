// IndexedDB local search storage for decrypted messages.
// This preserves E2EE by ensuring that decrypted plaintext is ONLY searched
// locally on the user's client device.

const DB_NAME = "threadline-messages-cache";
const DB_VERSION = 1;
const STORE_NAME = "messages";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not available"));
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("roomId", "roomId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("room_created", ["roomId", "createdAt"], {
          unique: false,
        });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      console.warn("[messageStore] Close other tabs to finish database update");
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const res = fn(store);

      tx.oncomplete = () => resolve(res);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Cache an array of decrypted messages for local search.
 * @param {string} roomId
 * @param {Array} messages
 */
export async function cacheDecryptedMessages(roomId, messages) {
  if (!roomId || !Array.isArray(messages) || messages.length === 0) return;

  try {
    await withStore("readwrite", (store) => {
      for (const m of messages) {
        if (!m || !m._id) continue;
        const text = (m.text || "").trim();
        const fileName = (m.media?.fileName || "").trim();

        // Only store messages with searchable content
        store.put({
          id: m._id,
          roomId,
          text,
          fileName,
          searchableText: `${text} ${fileName}`.toLowerCase(),
          senderName: m.sender?.name || "",
          createdAt: new Date(m.createdAt).getTime(),
          type: m.type || "user",
          encrypted: Boolean(m.encrypted),
        });
      }
    });
  } catch (err) {
    console.error("[messageStore] Failed to cache messages:", err);
  }
}

/**
 * Remove a deleted message from local cache.
 */
export async function removeCachedMessage(messageId) {
  if (!messageId) return;
  try {
    await withStore("readwrite", (store) => {
      store.delete(messageId);
    });
  } catch (err) {
    console.error("[messageStore] Failed to remove message:", err);
  }
}

/**
 * Search local cached messages within a room.
 * @param {string} roomId
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<{ id: string, text: string, fileName: string, createdAt: number, senderName: string }>>}
 */
export async function searchLocalMessages(roomId, query, limit = 50) {
  const q = (query || "").trim().toLowerCase();
  if (!roomId || !q) return [];

  try {
    const results = [];
    await withStore("readonly", (store) => {
      const index = store.index("roomId");
      const req = index.openCursor(IDBKeyRange.only(roomId), "prev"); // newest first

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor || results.length >= limit) return;

        const val = cursor.value;
        if (val.searchableText && val.searchableText.includes(q)) {
          results.push({
            id: val.id,
            text: val.text,
            fileName: val.fileName,
            senderName: val.senderName,
            createdAt: val.createdAt,
          });
        }
        cursor.continue();
      };
    });

    return results;
  } catch (err) {
    console.error("[messageStore] Search failed:", err);
    return [];
  }
}
