import http from "http";
import app from "./app.js";
import connectDB from "./config/db.js";
import env from "./config/env.js";
import initSocket from "./sockets/index.js";
import User from "./models/User.js";

const server = http.createServer(app);
const io = initSocket(server);
app.set("io", io); // lets REST controllers push real-time events

async function start() {
  await connectDB();

  // No sockets exist yet, so nobody can truly be online. This clears flags left over from a crash.
  await User.updateMany({ status: "online" }, { status: "offline" });

  server.listen(env.port, () => {
    console.log(`[server] Listening on http://localhost:${env.port}`);
  });
}

start();
