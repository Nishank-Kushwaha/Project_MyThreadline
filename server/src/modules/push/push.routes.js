import { Router } from "express";
import * as pushController from "./push.controller.js";
import authGuard from "../../middlewares/authGuard.js";

const router = Router();

router.use(authGuard);

router.get("/public-key", pushController.getPublicKey);
router.post("/subscribe", pushController.subscribe);
router.post("/unsubscribe", pushController.unsubscribe);

export default router;
