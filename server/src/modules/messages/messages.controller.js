import * as messagesService from "./messages.service.js";

async function getHistory(req, res, next) {
  try {
    const { roomId } = req.params;
    const { before, limit } = req.query;
    const messages = await messagesService.getRoomMessages(req.userId, roomId, {
      before,
      limit: Number(limit) || 30,
    });
    res.status(200).json({ success: true, messages });
  } catch (err) {
    next(err);
  }
}

export { getHistory };
