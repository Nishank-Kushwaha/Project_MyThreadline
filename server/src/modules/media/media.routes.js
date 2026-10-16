import { Router } from "express";
import * as mediaController from "./media.controller.js";
import authGuard from "../../middlewares/authGuard.js";
import mediaUpload from "../../middlewares/mediaUpload.js";

const router = Router();

router.use(authGuard);

router.post("/upload", mediaUpload.single("file"), mediaController.uploadMedia);

export default router;
