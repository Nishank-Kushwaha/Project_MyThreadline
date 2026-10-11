import api from "./axios";

export const publishDeviceKeyRequest = (data) => api.put("/keys/device", data);

export const listMyDeviceKeysRequest = () => api.get("/keys/me");

export const listUserDeviceKeysRequest = (userId) =>
  api.get(`/keys/users/${userId}`);

export const removeDeviceKeyRequest = (deviceId) =>
  api.delete(`/keys/device/${deviceId}`);
