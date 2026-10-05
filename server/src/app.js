import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import passport from "passport";
import env from "./config/env.js";

import "./config/passport.js"; // registers the Google strategy on the passport singleton

import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import roomsRoutes from "./modules/rooms/rooms.routes.js";
import pushRoutes from "./modules/push/push.routes.js";

import { notFound, errorHandler } from "./middlewares/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
if (env.nodeEnv !== "test") {
  app.use(morgan("dev"));
}

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/rooms", roomsRoutes);
app.use("/api/push", pushRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
