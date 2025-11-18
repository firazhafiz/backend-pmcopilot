// src/controllers/agentController.js
const { handleUserMessage } = require("../agent/predictiveAgent");

async function chatWithAgent(req, res, next) {
  try {
    const { message, machineId } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message wajib diisi!" });
    }

    // Pakai timestamp sebagai sessionId sederhana
    const sessionId = req.headers["x-session-id"] || Date.now().toString();
    const reply = await handleUserMessage(sessionId, message, machineId);

    res.json({
      reply,
      sessionId, // Buat maintain conversation
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { chatWithAgent };
