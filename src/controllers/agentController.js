// src/controllers/agentController.js
const { handleUserMessage } = require("../services/agentService");
const prisma = require("../lib/prisma"); // Singleton Prisma
const crypto = require("crypto"); // Wajib import ini untuk generate ID

async function chatWithAgent(req, res, next) {
  try {
    const { message } = req.body;
    
    // 1. Ambil ID dari URL (bisa jadi undefined jika New Chat)
    // Gunakan 'let' agar nilai variabel bisa diubah
    let { sessionId } = req.params; 

    // 2. LOGIKA BARU: Cek Ketersediaan ID
    if (!sessionId) {
      // JIKA TIDAK ADA ID (New Chat) -> KITA BUATKAN BARU
      sessionId = crypto.randomUUID(); 
      console.log(`[CONTROLLER] New Chat detected. Generated ID: ${sessionId}`);
    } 
    // (Hapus blok 'else if (!sessionId) return error' yang lama)

    // 3. Validasi Message (Tetap wajib)
    if (!message) {
      return res.status(400).json({ error: "Message wajib diisi!" });
    }

    // 4. Panggil Agent dengan ID (baik itu ID lama atau ID baru yg barusan digenerate)
    const reply = await handleUserMessage(sessionId, message);

    // 5. Kembalikan response
    // Frontend PENTING menangkap 'sessionId' ini untuk update URL
    res.json({
      reply,
      sessionId, 
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    next(error);
  }
}

// ... (fungsi getSessionHistory biarkan tetap sama) ...
async function getSessionHistory(req, res, next) {
  try {
    const { sessionId } = req.params;
    // Validasi ID wajib ada HANYA untuk GET history
    if (!sessionId) {
       return res.status(400).json({ error: "Session ID diperlukan untuk melihat history." });
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found", exists: false });
    }

    res.json({
      exists: true,
      sessionId: session.id,
      title: session.title,
      messages: session.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { chatWithAgent, getSessionHistory };