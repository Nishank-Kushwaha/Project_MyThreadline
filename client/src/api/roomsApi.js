import api from "./axios";

export const createRoomRequest = (data) => api.post("/rooms", data);

export const listRoomsRequest = () => api.get("/rooms");

export const getRoomMessagesRequest = (roomId, params = {}) =>
  api.get(`/rooms/${roomId}/messages`, { params });

export const getRoomMembersRequest = (roomId) =>
  api.get(`/rooms/${roomId}/members`);

export const addRoomMemberRequest = (roomId, memberId) =>
  api.post(`/rooms/${roomId}/members`, { memberId });

export const removeRoomMemberRequest = (roomId, memberId) =>
  api.delete(`/rooms/${roomId}/members/${memberId}`);

export const makeRoomAdminRequest = (roomId, memberId) =>
  api.post(`/rooms/${roomId}/admins`, { memberId });

export const demoteRoomAdminRequest = (roomId, memberId) =>
  api.delete(`/rooms/${roomId}/admins/${memberId}`);

export const leaveRoomRequest = (roomId) => api.post(`/rooms/${roomId}/leave`);

export const updateGroupNameRequest = (roomId, name) =>
  api.patch(`/rooms/${roomId}/name`, { name });

export const updateGroupAvatarRequest = (roomId, file) => {
  const formData = new FormData();
  formData.append("avatar", file);
  return api.patch(`/rooms/${roomId}/avatar`, formData);
};

export const removeGroupAvatarRequest = (roomId) =>
  api.delete(`/rooms/${roomId}/avatar`);
