import api from "./axios";

export const publishDeviceKeyRequest = (data) => api.put("/keys/device", data);

export const listMyDeviceKeysRequest = () => api.get("/keys/me");

export const listUserDeviceKeysRequest = (userId) =>
  api.get(`/keys/users/${userId}`);

export const removeDeviceKeyRequest = (deviceId) =>
  api.delete(`/keys/device/${deviceId}`);

export const getBackupRequest = () => api.get("/keys/backup");

export const createBackupRequest = (data) => api.put("/keys/backup", data);

export const addBackupEntryRequest = (entry) =>
  api.post("/keys/backup/entries", { entry });

export const changeBackupPassphraseRequest = (data) =>
  api.put("/keys/backup/passphrase", data);
