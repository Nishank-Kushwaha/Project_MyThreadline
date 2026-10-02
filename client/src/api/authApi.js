// src/api/authApi.js
import api from "./axios";

export const registerRequest = (data) => api.post("/auth/register", data);
export const loginRequest = (data) => api.post("/auth/login", data);
export const logoutRequest = () => api.post("/auth/logout");
export const meRequest = () => api.get("/auth/me");
export const refreshRequest = () => api.post("/auth/refresh");
