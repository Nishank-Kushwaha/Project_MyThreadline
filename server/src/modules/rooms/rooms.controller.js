import * as roomsService from "./rooms.service.js";
import ApiError from "../../utils/ApiError.js";
import { createSystemMessage } from "../messages/messages.service.js";

// After a room is created over REST, pull every OTHER member's live sockets
// into it and tell their UI about it.
async function notifyMembers(req, roomId) {
  const io = req.app.get("io"); // set in server.js
  if (!io) return;

  const memberIds = await roomsService.getRoomMemberIds(roomId);

  for (const memberId of memberIds) {
    if (memberId === req.userId) continue; // creator already has it from the REST response

    io.in(`user:${memberId}`).socketsJoin(roomId.toString());

    const roomForMember = await roomsService.getRoomForUser(roomId, memberId);

    io.to(`user:${memberId}`).emit("room:new", roomForMember);
  }
}

// Sends a system message to everyone in the room, optionally skipping one user
// (someone who just left/was removed and shouldn't see their own exit line).
function emitSystemMessage(io, roomId, message, exceptUserId = null) {
  if (!io || !message) return;

  const target = io.to(roomId);

  (exceptUserId ? target.except(`user:${exceptUserId}`) : target).emit(
    "message:system",
    { roomId, message },
  );
}

async function createRoom(req, res, next) {
  try {
    const { type, memberId, name, memberIds } = req.body;

    let room;

    if (type === "private") {
      if (!memberId) {
        throw new ApiError(400, "memberId is required for a private room");
      }

      room = await roomsService.createPrivateRoom(req.userId, memberId);
    } else if (type === "group") {
      room = await roomsService.createGroupRoom(req.userId, name, memberIds);

      await createSystemMessage({
        roomId: room.id.toString(),
        kind: "group-created",
        actorId: req.userId,
        meta: { newName: room.name },
      });

      // Re-read so the response and room:new include the new lastMessage.
      room = await roomsService.getRoomForUser(room.id, req.userId);
    } else {
      throw new ApiError(400, "type must be 'private' or 'group'");
    }

    await notifyMembers(req, room.id);

    res.status(201).json({
      success: true,
      room,
    });
  } catch (err) {
    next(err);
  }
}

async function getMembers(req, res, next) {
  try {
    const members = await roomsService.getRoomMembers(
      req.params.roomId,
      req.userId,
    );

    res.status(200).json({
      success: true,
      members,
    });
  } catch (err) {
    next(err);
  }
}

async function addMember(req, res, next) {
  try {
    const { memberId } = req.body;

    if (!memberId) {
      throw new ApiError(400, "memberId is required");
    }

    const room = await roomsService.addRoomMember(
      req.params.roomId,
      req.userId,
      memberId,
    );

    const roomId = room._id.toString();

    const systemMessage = await createSystemMessage({
      roomId,
      kind: "member-added",
      actorId: req.userId,
      targetId: memberId,
    });

    const io = req.app.get("io");

    if (io) {
      // Pull the new member's sockets into the room
      // and tell their UI about the new room.
      io.in(`user:${memberId}`).socketsJoin(roomId);

      const roomForNewMember = await roomsService.getRoomForUser(
        roomId,
        memberId,
      );

      io.to(`user:${memberId}`).emit("room:new", roomForNewMember);

      // Tell everyone already in the room that a member was added.
      io.to(roomId)
        .except(`user:${memberId}`)
        .emit("room:member-added", { roomId, memberId });

      // Everyone, including the new member (already joined above).
      emitSystemMessage(io, roomId, systemMessage);
    }

    const members = await roomsService.getRoomMembers(roomId, req.userId);

    res.status(201).json({
      success: true,
      members,
    });
  } catch (err) {
    next(err);
  }
}

async function removeMember(req, res, next) {
  try {
    const { memberId } = req.params;

    const room = await roomsService.removeRoomMember(
      req.params.roomId,
      req.userId,
      memberId,
    );

    const roomId = room._id.toString();

    const systemMessage = await createSystemMessage({
      roomId,
      kind: "member-removed",
      actorId: req.userId,
      targetId: memberId,
    });

    const io = req.app.get("io");

    if (io) {
      // Tell the people staying in the room first.
      io.to(roomId)
        .except(`user:${memberId}`)
        .emit("room:member-removed", { roomId, memberId });

      // Everyone, including the removed member (who is still in the room until the next line).
      emitSystemMessage(io, roomId, systemMessage, memberId);

      // Tell the removed member that they were removed.
      io.to(`user:${memberId}`).emit("room:removed", {
        roomId,
      });

      // Remove the person's sockets from the Socket.IO room.
      io.in(`user:${memberId}`).socketsLeave(roomId);
    }

    const members = await roomsService.getRoomMembers(roomId, req.userId);

    res.status(200).json({
      success: true,
      members,
    });
  } catch (err) {
    next(err);
  }
}

async function makeAdmin(req, res, next) {
  try {
    const { memberId } = req.body;

    if (!memberId) {
      throw new ApiError(400, "memberId is required");
    }

    const room = await roomsService.promoteToAdmin(
      req.params.roomId,
      req.userId,
      memberId,
    );

    const roomId = room._id.toString();

    const systemMessage = await createSystemMessage({
      roomId,
      kind: "member-promoted",
      actorId: req.userId,
      targetId: memberId,
    });

    const io = req.app.get("io");

    if (io) {
      // Everyone in the room (the promoted person included, since members
      // are already socketsJoin'd) sees the crown appear live.
      io.to(roomId).emit("room:member-promoted", {
        roomId,
        memberId,
      });

      // Everyone, including the promoted member.
      emitSystemMessage(io, roomId, systemMessage);
    }

    const members = await roomsService.getRoomMembers(roomId, req.userId);

    res.status(200).json({
      success: true,
      members,
    });
  } catch (err) {
    next(err);
  }
}

async function demoteAdmin(req, res, next) {
  try {
    const { memberId } = req.params;

    const room = await roomsService.demoteAdmin(
      req.params.roomId,
      req.userId,
      memberId,
    );

    const roomId = room._id.toString();

    const systemMessage = await createSystemMessage({
      roomId,
      kind: "member-demoted",
      actorId: req.userId,
      targetId: memberId,
    });

    const io = req.app.get("io");

    if (io) {
      // Everyone in the room (the demoted person included) sees the crown go.
      io.to(roomId).emit("room:member-demoted", { roomId, memberId });

      emitSystemMessage(io, roomId, systemMessage);
    }

    const members = await roomsService.getRoomMembers(roomId, req.userId);

    res.status(200).json({
      success: true,
      members,
    });
  } catch (err) {
    next(err);
  }
}

async function transferCreator(req, res, next) {
  try {
    const { memberId } = req.body;

    if (!memberId) {
      throw new ApiError(400, "memberId is required");
    }

    const room = await roomsService.transferCreator(
      req.params.roomId,
      req.userId,
      memberId,
    );

    const roomId = room._id.toString();

    const systemMessage = await createSystemMessage({
      roomId,
      kind: "creator-transferred",
      actorId: req.userId,
      targetId: memberId,
    });

    const io = req.app.get("io");

    if (io) {
      // Open member panels refresh so the "Creator" label moves live.
      io.to(roomId).emit("room:creator-transferred", { roomId, memberId });

      emitSystemMessage(io, roomId, systemMessage);
    }

    const members = await roomsService.getRoomMembers(roomId, req.userId);

    res.status(200).json({
      success: true,
      members,
    });
  } catch (err) {
    next(err);
  }
}

async function leaveRoom(req, res, next) {
  try {
    const { roomId, promotedId, newCreatorId, deleted } =
      await roomsService.leaveRoom(req.params.roomId, req.userId);

    const leftMessage = deleted
      ? null
      : await createSystemMessage({
          roomId,
          kind: "member-left",
          actorId: req.userId,
        });

    const promotedMessage = promotedId
      ? await createSystemMessage({
          roomId,
          kind: "member-auto-promoted",
          actorId: req.userId,
          targetId: promotedId,
        })
      : null;

    const creatorMessage = newCreatorId
      ? await createSystemMessage({
          roomId,
          kind: "creator-auto-transferred",
          actorId: req.userId,
          targetId: newCreatorId,
        })
      : null;

    const io = req.app.get("io");

    if (io) {
      if (!deleted) {
        // Tell the people staying in the room first.
        io.to(roomId)
          .except(`user:${req.userId}`)
          .emit("room:member-removed", { roomId, memberId: req.userId });

        // The only admin left, so someone was promoted automatically.
        if (promotedId) {
          io.to(roomId)
            .except(`user:${req.userId}`)
            .emit("room:member-promoted", { roomId, memberId: promotedId });
        }

        // The only creator left, so the creator role was transferred automatically.
        if (newCreatorId) {
          io.to(roomId)
            .except(`user:${req.userId}`)
            .emit("room:creator-transferred", {
              roomId,
              memberId: newCreatorId,
            });
        }

        // Everyone, including the leaver (who is still in the room until the next line).
        emitSystemMessage(io, roomId, leftMessage, req.userId);
        emitSystemMessage(io, roomId, promotedMessage, req.userId);
        emitSystemMessage(io, roomId, creatorMessage, req.userId);
      }

      // Same event as being removed by an admin: the Dashboard drops the room
      // from the sidebar and closes the chat/panel.
      io.to(`user:${req.userId}`).emit("room:removed", { roomId });

      // Remove the leaver's sockets from the Socket.IO room.
      io.in(`user:${req.userId}`).socketsLeave(roomId);
    }

    res.status(200).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

async function updateGroupName(req, res, next) {
  try {
    const { name } = req.body;

    if (!name) {
      throw new ApiError(400, "New group name is required");
    }

    const { room, oldName, changed } = await roomsService.updateGroupName(
      req.params.roomId,
      req.userId,
      name,
    );

    const roomId = room.id.toString();

    if (changed) {
      const systemMessage = await createSystemMessage({
        roomId,
        kind: "name-changed",
        actorId: req.userId,
        meta: { oldName, newName: room.name },
      });

      const io = req.app.get("io");

      if (io) {
        // Everyone in the room (the requester included) sees the new name live.
        io.to(roomId).emit("room:name-updated", { roomId, name: room.name });

        // Everyone, including the requester.
        emitSystemMessage(io, roomId, systemMessage);
      }
    }

    res.status(200).json({
      success: true,
      room,
    });
  } catch (err) {
    next(err);
  }
}

async function updateGroupAvatar(req, res, next) {
  try {
    const room = await roomsService.updateGroupAvatar(
      req.params.roomId,
      req.userId,
      req.file,
    );

    const roomId = room.id.toString();

    const systemMessage = await createSystemMessage({
      roomId,
      kind: "avatar-changed",
      actorId: req.userId,
    });

    const io = req.app.get("io");

    if (io) {
      // Everyone in the room (the requester included) sees the new photo live.
      io.to(roomId).emit("room:avatar-updated", {
        roomId,
        avatarUrl: room.avatarUrl,
      });

      // Everyone, including the requester.
      emitSystemMessage(io, roomId, systemMessage);
    }

    res.status(200).json({
      success: true,
      room,
    });
  } catch (err) {
    next(err);
  }
}

async function removeGroupAvatar(req, res, next) {
  try {
    const { room, changed } = await roomsService.removeGroupAvatar(
      req.params.roomId,
      req.userId,
    );

    const roomId = room.id.toString();

    if (changed) {
      const systemMessage = await createSystemMessage({
        roomId,
        kind: "avatar-removed",
        actorId: req.userId,
      });

      const io = req.app.get("io");

      if (io) {
        // Everyone in the room (the requester included) sees the new photo live.
        io.to(roomId).emit("room:avatar-updated", {
          roomId,
          avatarUrl: room.avatarUrl,
        });

        // Everyone, including the requester.
        emitSystemMessage(io, roomId, systemMessage);
      }
    }
    res.status(200).json({
      success: true,
      room,
    });
  } catch (err) {
    next(err);
  }
}

async function listRooms(req, res, next) {
  try {
    const rooms = await roomsService.getUserRooms(req.userId);

    res.status(200).json({
      success: true,
      rooms,
    });
  } catch (err) {
    next(err);
  }
}

export {
  createRoom,
  listRooms,
  getMembers,
  addMember,
  removeMember,
  makeAdmin,
  demoteAdmin,
  transferCreator,
  leaveRoom,
  updateGroupName,
  updateGroupAvatar,
  removeGroupAvatar,
};
