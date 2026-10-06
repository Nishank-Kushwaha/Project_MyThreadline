import api from "./axios";

export const updateProfileRequest = (data) => api.patch("/users/me", data);
export const changePasswordRequest = (data) =>
  api.patch("/users/me/password", data);

export const uploadAvatarRequest = (file) => {
  const formData = new FormData();
  formData.append("avatar", file);
  return api.post("/users/me/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const removeAvatarRequest = () => api.delete("/users/me/avatar");

export const listUsersRequest = () => api.get("/users");

export const updateThemeRequest = (theme) =>
  api.patch("/users/me/theme", { theme });
