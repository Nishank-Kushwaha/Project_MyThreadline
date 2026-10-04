import { Router } from "express";
import * as roomsController from "./rooms.controller.js";
import * as messagesController from "../messages/messages.controller.js";
import authGuard from "../../middlewares/authGuard.js";
import upload from "../../middlewares/upload.js";

const router = Router();

router.use(authGuard);

router.post("/", roomsController.createRoom);
router.get("/", roomsController.listRooms);
router.get("/:roomId/messages", messagesController.getHistory);
router.get("/:roomId/members", roomsController.getMembers);
router.post("/:roomId/members", roomsController.addMember);
router.delete("/:roomId/members/:memberId", roomsController.removeMember);
router.post("/:roomId/admins", roomsController.makeAdmin);
router.post("/:roomId/leave", roomsController.leaveRoom);
router.patch("/:roomId/name", roomsController.updateGroupName);
router.patch(
  "/:roomId/avatar",
  upload.single("avatar"),
  roomsController.updateGroupAvatar,
);
router.delete("/:roomId/avatar", roomsController.removeGroupAvatar);

export default router;
