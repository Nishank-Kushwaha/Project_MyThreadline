import { Router } from "express";
import * as keysController from "./keys.controller.js";
import authGuard from "../../middlewares/authGuard.js";

const router = Router();

router.use(authGuard);

router.put("/device", keysController.publishDeviceKey);
router.get("/me", keysController.listMyKeys);
router.get("/users/:userId", keysController.listUserKeys);
router.delete("/device/:deviceId", keysController.removeDeviceKey);
router.get("/backup", keysController.getBackup);
router.put("/backup", keysController.createBackup);
router.post("/backup/entries", keysController.addBackupEntry);
router.put("/backup/passphrase", keysController.changeBackupPassphrase);

export default router;
