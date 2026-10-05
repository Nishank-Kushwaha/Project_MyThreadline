import api from "./axios";

export const getPushPublicKeyRequest = () => api.get("/push/public-key");

export const subscribePushRequest = (subscription) =>
  api.post("/push/subscribe", { subscription });

export const unsubscribePushRequest = (endpoint) =>
  api.post("/push/unsubscribe", { endpoint });
