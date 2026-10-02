import Message from "../../models/Message.js";
import { assertMembership } from "../rooms/rooms.service.js";

async function getRoomMessages(userId, roomId, { before, limit = 30 } = {}) {
  await assertMembership(roomId, userId);

  const query = { roomId };

  if (before) query.createdAt = { $lt: new Date(before) };

  const messages = await Message.find(query)

    .sort({ createdAt: -1 }) // newest first, so "30 before this point" works
    .limit(limit)
    .populate("sender", "name avatarUrl")
    .populate("reactions.userId", "name")
    .lean();

  return messages.reverse(); // flip to oldest-first for rendering
}

export { getRoomMessages };
