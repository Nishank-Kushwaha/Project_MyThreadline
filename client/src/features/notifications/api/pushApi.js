import api from "./axios";

export const getPushPublicKeyRequest = () => api.get("/push/public-key");

export const subscribePushRequest = (subscription, deviceId) =>
  api.post("/push/subscribe", { subscription, deviceId });

export const unsubscribePushRequest = (endpoint) =>
  api.post("/push/unsubscribe", { endpoint });
