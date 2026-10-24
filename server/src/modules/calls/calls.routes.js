import { Router } from "express";
import authGuard from "../../middlewares/authGuard.js";
import * as callsController from "./calls.controller.js";

const router = Router();

router.get("/ice-servers", authGuard, callsController.getIceServers);

export default router;
