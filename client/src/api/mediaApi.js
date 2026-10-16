import api from "./axios";

/**
 * Uploads media (encrypted blob or unencrypted file) to the server.
 * @param {Blob|File} file - The file or encrypted blob to upload.
 * @param {object} options
 * @param {boolean} options.encrypted - True if this is an encrypted blob, false if unencrypted.
 * @param {string} options.fileName - Original file name for formData.
 */
export const uploadMediaRequest = (
  file,
  { encrypted = false, fileName = "file" } = {},
) => {
  const formData = new FormData();
  formData.append("file", file, fileName);

  return api.post(`/media/upload?encrypted=${encrypted}`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};
