import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL,
  withCredentials: true,
});

let accessToken = null;
export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// AuthProvider registers this: called when the session can't be renewed
// (the refresh cookie expired or was revoked), so the app can show login.
let onSessionExpired = null;
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Gets a new access token using the refresh cookie. Several callers at once
// (a burst of failed requests, or the socket) share a single request.
let refreshPromise = null;

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${baseURL}/auth/refresh`, null, { withCredentials: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// A 401 on these means "wrong credentials" or "already logged out", not
// "token expired", so they must never trigger a refresh.
const NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
];

// If the access token expired: renew it once, then repeat the original request.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    const shouldTryRefresh =
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      accessToken && // not logged in => nothing to renew
      !NO_REFRESH_PATHS.some((path) => original.url?.includes(path));

    if (!shouldTryRefresh) return Promise.reject(error);

    original._retried = true;

    try {
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      // Only a real "no" from the server ends the session. A network problem
      // just fails this request; the user stays logged in.
      const status = refreshError.response?.status;
      if (status === 401 || status === 403) {
        setAccessToken(null);
        onSessionExpired?.();
      }
      return Promise.reject(error);
    }
  },
);

export default api;
