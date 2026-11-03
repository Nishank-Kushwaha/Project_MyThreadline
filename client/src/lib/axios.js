import axios from "axios";

// config
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const AUTH_ENDPOINTS = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  REFRESH: "/auth/refresh",
  LOGOUT: "/auth/logout",
};

// a 401 on these isn't "token expired", so never refresh for them
const NO_REFRESH_PATHS = Object.values(AUTH_ENDPOINTS);

const HTTP_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
};

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// state
let accessToken = null; // AuthProvider sets this on login, refresh, and logout
let onSessionExpired = null; // AuthProvider sets this to show login
let refreshPromise = null; // concurrent callers share one refresh request

// token
export const getAccessToken = () => accessToken;

export const setAccessToken = (token) => {
  accessToken = token;
};

export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

// refresh
export const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}${AUTH_ENDPOINTS.REFRESH}`, null, {
        withCredentials: true,
      })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// helpers
const isAuthEndpoint = (url = "") =>
  NO_REFRESH_PATHS.some((path) => url.includes(path));

const shouldAttemptRefresh = (error) => {
  const original = error.config;

  return Boolean(
    error.response?.status === HTTP_STATUS.UNAUTHORIZED &&
    original &&
    !original._retried &&
    accessToken && // not logged in, nothing to renew
    !isAuthEndpoint(original.url),
  );
};

// only a real 401/403 ends the session, network errors don't
const isSessionInvalid = (refreshError) => {
  const status = refreshError.response?.status;
  return (
    status === HTTP_STATUS.UNAUTHORIZED || status === HTTP_STATUS.FORBIDDEN
  );
};

// interceptors
const attachAccessToken = (config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
};

// refresh once on 401, then retry the original request
const handleResponseError = async (error) => {
  if (!shouldAttemptRefresh(error)) return Promise.reject(error);

  const original = error.config;
  original._retried = true;

  try {
    const token = await refreshAccessToken();
    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  } catch (refreshError) {
    if (isSessionInvalid(refreshError)) {
      setAccessToken(null);
      onSessionExpired?.();
    }
    return Promise.reject(error);
  }
};

api.interceptors.request.use(attachAccessToken);
api.interceptors.response.use((response) => response, handleResponseError);

export default api;
