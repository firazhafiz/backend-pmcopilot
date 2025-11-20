// src/controllers/agentController.js

const agentService = require("../services/agentService");

async function chatWithAgent(req, res, next) {
  try {
    const { message, machineId } = req.body;
    
    // Ambil ID dari Body atau Header
    const sessionIdInput = req.body.sessionId || req.headers["x-session-id"];

    // Validasi Input Dasar
    if (!message) {
      return res.status(400).json({ error: "Message wajib diisi!" });
    }

    // Panggil Service (Semua logika berat ada di sini)
    const result = await agentService.processChat(sessionIdInput, message, machineId);

    // Kirim Response
    res.json(result);

  } catch (error) {
    // Error handling terpusat
    next(error);
  }
}

module.exports = { chatWithAgent };