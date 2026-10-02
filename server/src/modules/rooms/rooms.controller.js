import * as roomsService from "./rooms.service.js";
import ApiError from "../../utils/ApiError.js";

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

    const io = req.app.get("io");

    if (io) {
      // Tell the people staying in the room first.
      io.to(roomId)
        .except(`user:${memberId}`)
        .emit("room:member-removed", { roomId, memberId });

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

    const io = req.app.get("io");

    if (io) {
      // Everyone in the room (the promoted person included, since members
      // are already socketsJoin'd) sees the crown appear live.
      io.to(roomId).emit("room:member-promoted", {
        roomId,
        memberId,
      });
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

async function updateGroupName(req, res, next) {
  try {
    const { name } = req.body;

    if (!name) {
      throw new ApiError(400, "New group name is required");
    }

    const room = await roomsService.updateGroupName(
      req.params.roomId,
      req.userId,
      name,
    );

    const roomId = room.id.toString();

    const io = req.app.get("io");

    if (io) {
      // Everyone in the room (the requester included) sees the new name live,
      // same approach as room:member-promoted.
      io.to(roomId).emit("room:name-updated", {
        roomId,
        name: room.name,
      });
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

    const io = req.app.get("io");

    if (io) {
      // Everyone in the room (the requester included) sees the new photo live.
      io.to(roomId).emit("room:avatar-updated", {
        roomId,
        avatarUrl: room.avatarUrl,
      });
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
    const room = await roomsService.removeGroupAvatar(
      req.params.roomId,
      req.userId,
    );

    const roomId = room.id.toString();

    const io = req.app.get("io");

    if (io) {
      // Same event as an upload; avatarUrl is null once the photo is gone,
      // so the UI falls back to the group's initial.
      io.to(roomId).emit("room:avatar-updated", {
        roomId,
        avatarUrl: room.avatarUrl,
      });
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
  updateGroupName,
  updateGroupAvatar,
  removeGroupAvatar,
};
