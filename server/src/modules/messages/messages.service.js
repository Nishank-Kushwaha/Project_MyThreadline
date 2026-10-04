import Message from "../../models/Message.js";
import Room from "../../models/Room.js";
import User from "../../models/User.js";
import { assertMembership } from "../rooms/rooms.service.js";

async function getRoomMessages(userId, roomId, { before, limit = 30 } = {}) {
  await assertMembership(roomId, userId);

  const query = { roomId };

  if (before) query.createdAt = { $lt: new Date(before) };

  const messages = await Message.find(query)

    .sort({ createdAt: -1, _id: -1 }) // newest first, so "30 before this point" works
    .limit(limit)
    .populate("sender", "name avatarUrl")
    .populate("reactions.userId", "name")
    .lean();

  return messages.reverse(); // flip to oldest-first for rendering
}

// Plain, viewer-neutral sentence. Used for the sidebar preview and as a
// fallback; the chat itself renders per-viewer text ("You" vs a name).
function buildText(kind, actorName, targetName, meta) {
  switch (kind) {
    case "group-created":
      return `${actorName} created group "${meta.newName}"`;
    case "name-changed":
      return `${actorName} changed the group name from "${meta.oldName}" to "${meta.newName}"`;
    case "avatar-changed":
      return `${actorName} changed this group's icon`;
    case "avatar-removed":
      return `${actorName} deleted this group's icon`;
    case "member-added":
      return `${actorName} added ${targetName}`;
    case "member-removed":
      return `${actorName} removed ${targetName}`;
    case "member-promoted":
      return `${actorName} made ${targetName} an admin`;
    case "member-demoted":
      return `${actorName} dismissed ${targetName} as an admin`;
    case "member-left":
      return `${actorName} left`;
    case "member-auto-promoted":
      return `${targetName} is now an admin`;
    default:
      return "";
  }
}

// Saves the event, makes it the room's sidebar preview, and returns the
// payload to emit. Never throws: if saving fails the action itself already
// succeeded, so this is logged and the caller just skips the emit.
async function createSystemMessage({
  roomId,
  kind,
  actorId,
  targetId = null,
  meta = {},
}) {
  try {
    const ids = [actorId, targetId].filter(Boolean);
    const users = await User.find({ _id: { $in: ids } })
      .select("name")
      .lean();

    const nameOf = (id) =>
      users.find((u) => u._id.toString() === id?.toString())?.name || "Someone";

    const actorName = nameOf(actorId);
    const targetName = targetId ? nameOf(targetId) : null;

    const system = {
      kind,
      actorId: actorId.toString(),
      actorName,
      targetId: targetId ? targetId.toString() : null,
      targetName,
      meta,
    };

    const message = await Message.create({
      roomId,
      type: "system",
      sender: actorId,
      text: buildText(kind, actorName, targetName, meta),
      system,
    });

    // Sidebar preview + ordering. No unreadCount change, and sender is null
    // so the sidebar doesn't show a "You:" prefix. `system` lets the client
    // word the preview per viewer ("Alice added you").
    await Room.updateOne(
      { _id: roomId },
      {
        lastMessage: {
          messageId: message._id,
          text: message.text,
          sender: null,
          createdAt: message.createdAt,
          system,
        },
      },
    );

    return {
      _id: message._id.toString(),
      roomId: roomId.toString(),
      type: "system",
      sender: { _id: actorId.toString(), name: actorName },
      text: message.text,
      system,
      createdAt: message.createdAt,
    };
  } catch (err) {
    console.error("[system message] couldn't save", kind, err.message);
    return null;
  }
}

export { getRoomMessages, createSystemMessage };
