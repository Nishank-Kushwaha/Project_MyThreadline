import api from "./axios";

export async function fetchIceServersRequest() {
  const res = await api.get("/calls/ice-servers");
  return res.data;
}
