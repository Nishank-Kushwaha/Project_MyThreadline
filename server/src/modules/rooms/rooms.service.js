import Room from "../../models/Room.js";
import Message from "../../models/Message.js";
import ApiError from "../../utils/ApiError.js";
import { uploadAvatarImage, deleteImage } from "../../utils/imageStorage.js";

function shapeRoom(room, userId) {
  const myMembership = room.members.find(
    (m) => m.userId._id.toString() === userId,
  );
  const otherMembers = room.members.filter(
    (m) => m.userId._id.toString() !== userId,
  );

  const display =
    room.type === "private"
      ? {
          name: otherMembers[0]?.userId.name,
          avatarUrl: otherMembers[0]?.userId.avatarUrl,
          status: otherMembers[0]?.userId.status,
          lastSeen: otherMembers[0]?.userId.lastSeen,
          otherUserId: otherMembers[0]?.userId._id.toString(),
        }
      : {
          name: room?.name,
          avatarUrl: room?.groupAvatarUrl,
          status: null,
          lastSeen: null,
          otherUserId: null,
        };

  return {
    id: room._id,
    type: room.type,
    name: display.name,
    avatarUrl: display.avatarUrl,
    status: display.status,
    lastSeen: display.lastSeen,
    otherUserId: display.otherUserId,
    lastMessage: room.lastMessage || null,
    unreadCount: myMembership?.unreadCount || 0,
    memberCount: room.members.length,
    isAdmin: myMembership?.isAdmin || false,
  };
}

async function populateRoom(roomId, userId) {
  const room = await Room.findById(roomId)
    .populate("members.userId", "name avatarUrl status lastSeen")
    .lean();
  return shapeRoom(room, userId);
}

async function assertMembership(roomId, userId) {
  const room = await Room.findOne({ _id: roomId, "members.userId": userId });
  if (!room) throw new ApiError(403, "You are not a member of this room");
  return room;
}

async function assertGroupAdmin(roomId, userId) {
  const room = await assertMembership(roomId, userId);

  if (room.type !== "group") {
    throw new ApiError(400, "Only groups have members you can manage");
  }

  const membership = room.members.find((m) => m.userId.toString() === userId);

  if (!membership?.isAdmin) {
    throw new ApiError(403, "Only an admin can do that");
  }

  return room;
}

async function createPrivateRoom(userId, otherUserId) {
  if (userId === otherUserId)
    throw new ApiError(400, "Can't start a chat with yourself");

  // Reuse the existing private room instead of creating duplicates.
  let room = await Room.findOne({
    type: "private",
    "members.userId": { $all: [userId, otherUserId] },
  });

  if (!room) {
    room = await Room.create({
      type: "private",
      members: [{ userId }, { userId: otherUserId }],
    });
  }
  return populateRoom(room._id, userId);
}

async function createGroupRoom(userId, name, memberIds = []) {
  if (!name || !name.trim()) throw new ApiError(400, "Group name is required");

  const uniqueMemberIds = [...new Set([userId, ...memberIds])];
  if (uniqueMemberIds.length < 3)
    throw new ApiError(400, "A group needs at least 2 other members");

  const joinedAt = new Date();

  const room = await Room.create({
    type: "group",
    name: name.trim(),
    members: uniqueMemberIds.map((id) => ({
      userId: id,
      isAdmin: id === userId,
      joinedAt,
    })),
  });

  return populateRoom(room._id, userId);
}

async function getUserRooms(userId) {
  const rooms = await Room.find({ "members.userId": userId })
    .sort({ "lastMessage.createdAt": -1, updatedAt: -1 })
    .populate("members.userId", "name avatarUrl status lastSeen")
    .lean();
  return rooms.map((room) => shapeRoom(room, userId));
}

async function addRoomMember(roomId, requesterId, newMemberId) {
  const room = await assertGroupAdmin(roomId, requesterId);

  const alreadyIn = room.members.some(
    (m) => m.userId.toString() === newMemberId,
  );

  if (alreadyIn) {
    throw new ApiError(409, "That person is already in the group");
  }

  const joinedAt = new Date();

  room.members.push({
    userId: newMemberId,
    isAdmin: false,
    joinedAt,
  });

  await room.save();

  return room;
}

async function removeRoomMember(roomId, requesterId, targetId) {
  const room = await assertGroupAdmin(roomId, requesterId);

  if (targetId === requesterId) {
    throw new ApiError(400, "Use 'Leave group' to remove yourself");
  }

  const target = room.members.find((m) => m.userId.toString() === targetId);

  if (!target) {
    throw new ApiError(404, "That person isn't in this group");
  }

  if (target.isAdmin) {
    throw new ApiError(400, "Admins can't be removed this way");
  }

  room.members = room.members.filter((m) => m.userId.toString() !== targetId);

  await room.save();

  return room;
}

async function promoteToAdmin(roomId, requesterId, targetId) {
  const room = await assertGroupAdmin(roomId, requesterId);

  const target = room.members.find((m) => m.userId.toString() === targetId);

  if (!target) {
    throw new ApiError(404, "That person isn't in this group");
  }

  if (target.isAdmin) {
    throw new ApiError(409, "That person is already an admin");
  }

  target.isAdmin = true;

  // Mongoose usually tracks this automatically for array subdocuments, but
  // marking it explicitly removes any doubt that the mutation gets saved.
  room.markModified("members");

  await room.save();

  return room;
}

async function leaveRoom(roomId, userId) {
  const room = await assertMembership(roomId, userId);

  if (room.type !== "group") {
    throw new ApiError(400, "You can only leave group chats");
  }

  const leaving = room.members.find((m) => m.userId.toString() === userId);
  const remaining = room.members.filter((m) => m.userId.toString() !== userId);

  // Last person out: nobody is left to see this room, so delete it.
  if (remaining.length === 0) {
    // Messages first: if this fails the room still exists and the user can
    // simply retry, instead of leaving orphaned messages behind a deleted room.
    await Message.deleteMany({ roomId });
    await Room.deleteOne({ _id: roomId });

    // The group photo lives on Cloudinary, so clean it up too. The room is
    // already gone, so a failure here is logged but doesn't fail the request.
    if (room.groupAvatarPublicId) {
      try {
        await deleteImage(room.groupAvatarPublicId);
      } catch (err) {
        console.error(
          "[cloudinary] couldn't delete group avatar of deleted room",
          room.groupAvatarPublicId,
          err.message,
        );
      }
    }

    return { roomId: room._id.toString(), promotedId: null, deleted: true };
  }

  // Never leave a group without an admin: promote whoever joined earliest.
  // Members with no joinedAt predate the field, so they count as the oldest;
  // the sort is stable, so ties keep their order in the array.
  let promotedId = null;

  if (leaving.isAdmin && !remaining.some((m) => m.isAdmin)) {
    const [longestStanding] = [...remaining].sort(
      (a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0),
    );

    longestStanding.isAdmin = true;
    promotedId = longestStanding.userId.toString();
  }

  room.members = remaining;
  room.markModified("members");

  await room.save();

  return { roomId: room._id.toString(), promotedId, deleted: false };
}

async function getRoomForUser(roomId, userId) {
  return populateRoom(roomId, userId);
}

async function getRoomMemberIds(roomId) {
  const room = await Room.findById(roomId).select("members.userId").lean();
  return room.members.map((m) => m.userId.toString());
}

async function getRoomMembers(roomId, userId) {
  const room = await Room.findOne({
    _id: roomId,
    "members.userId": userId,
  })
    .populate("members.userId", "name avatarUrl status")
    .lean();

  if (!room) {
    throw new ApiError(403, "You are not a member of this room");
  }

  return room.members.map((m) => ({
    id: m.userId._id,
    name: m.userId.name,
    avatarUrl: m.userId.avatarUrl,
    status: m.userId.status,
    isAdmin: m.isAdmin,
  }));
}

async function updateGroupName(roomId, requesterId, name) {
  const MAX_GROUP_NAME_LENGTH = 50;

  const group = await assertGroupAdmin(roomId, requesterId);
  const oldName = group.name;

  const trimmed = typeof name === "string" ? name.trim() : "";

  if (!trimmed) throw new ApiError(400, "Group name is required");
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    throw new ApiError(
      400,
      `Group name can't be longer than ${MAX_GROUP_NAME_LENGTH} characters`,
    );
  }

  // Same name as before: nothing to update, nothing to announce.
  if (trimmed === oldName) {
    return {
      room: await populateRoom(roomId, requesterId),
      oldName,
      changed: false,
    };
  }

  await Room.updateOne(
    { _id: roomId },
    { name: trimmed },
    { runValidators: true },
  );

  return {
    room: await populateRoom(roomId, requesterId),
    oldName,
    changed: true,
  };
}

async function updateGroupAvatar(roomId, requesterId, file) {
  if (!file) throw new ApiError(400, "Please choose an image");

  const room = await assertGroupAdmin(roomId, requesterId);
  const oldPublicId = room.groupAvatarPublicId;

  // 1) Upload the new image.
  let uploaded;
  try {
    uploaded = await uploadAvatarImage(file.buffer);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[cloudinary] group upload failed:", err.message);
    throw new ApiError(502, "Couldn't upload that image. Please try again.");
  }

  // 2) Point the room at it. If saving fails, don't leave the new image orphaned.
  try {
    await Room.updateOne(
      { _id: roomId },
      {
        groupAvatarUrl: uploaded.url,
        groupAvatarPublicId: uploaded.publicId,
      },
    );
  } catch (err) {
    await deleteImage(uploaded.publicId).catch(() => {});
    throw err;
  }

  // 3) Delete the previous image. The group already has its new photo, so a
  //    failure here is logged but doesn't fail the request.
  if (oldPublicId) {
    try {
      await deleteImage(oldPublicId);
    } catch (err) {
      console.error(
        "[cloudinary] couldn't delete old group avatar",
        oldPublicId,
        err.message,
      );
    }
  }

  return populateRoom(roomId, requesterId);
}

async function removeGroupAvatar(roomId, requesterId) {
  const room = await assertGroupAdmin(roomId, requesterId);

  // Nothing to remove, treat as success so the call is idempotent.
  if (!room.groupAvatarUrl && !room.groupAvatarPublicId) {
    return { room: await populateRoom(roomId, requesterId), changed: false };
  }

  if (room.groupAvatarPublicId) {
    try {
      await deleteImage(room.groupAvatarPublicId);
    } catch (err) {
      console.error(
        "[cloudinary] couldn't delete group avatar",
        room.groupAvatarPublicId,
        err.message,
      );
      throw new ApiError(
        502,
        "Couldn't remove the group photo. Please try again.",
      );
    }
  }

  await Room.updateOne(
    { _id: roomId },
    { groupAvatarUrl: "", groupAvatarPublicId: "" },
  );

  return { room: await populateRoom(roomId, requesterId), changed: true };
}

export {
  createPrivateRoom,
  createGroupRoom,
  getUserRooms,
  assertMembership,
  assertGroupAdmin,
  addRoomMember,
  removeRoomMember,
  promoteToAdmin,
  leaveRoom,
  getRoomForUser,
  getRoomMemberIds,
  getRoomMembers,
  updateGroupName,
  updateGroupAvatar,
  removeGroupAvatar,
};
