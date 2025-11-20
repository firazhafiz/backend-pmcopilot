// src/services/agentService.js
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { PrismaClient } = require("@prisma/client");
const {
  HumanMessage,
  AIMessage,
  SystemMessage,
} = require("@langchain/core/messages");

// --- PERUBAHAN UTAMA DI SINI (MODERN WAY) ---
const { createReactAgent } = require("@langchain/langgraph/prebuilt");

const config = require("../config");
const machineTools = require("../tools/machineTools"); // Pastikan path tool benar

const prisma = new PrismaClient();

// Inisialisasi Model
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  apiKey: config.googleApiKey,
});

class AgentService {
  constructor() {
    this.agentGraph = null;
    this._initAgent();
  }

  /**
   * Inisialisasi Agent menggunakan LangGraph
   */
  _initAgent() {
    // Di LangGraph, kita tidak perlu manual membuat Prompt Template yang rumit.
    // Cukup berikan System Message di stateModifier.

    const systemMessage = `
      PERAN: Kamu adalah asisten ahli Predictive Maintenance (Industry 4.0).
      
      ATURAN UTAMA:
      1. Tugasmu adalah memberikan analisis kondisi mesin secara REAL-TIME.
      2. JIKA user bertanya tentang mesin (menyebutkan ID seperti 'M14860', 'L47181', dll), kamu WAJIB memanggil tool 'check_machine_health'.
      3. JANGAN PERNAH menyuruh user mengetik perintah manual (seperti '/status' atau lainnya). Langsung eksekusi tool-nya.
      4. Setelah tool memberikan data (JSON), jelaskan datanya dengan bahasa manusia yang profesional.
         - Sebutkan Sensor Data (Suhu, RPM, dll).
         - Sebutkan Hasil Analisis AI (Kondisi & Rekomendasi).
      
      Gaya Bicara: Profesional, Singkat, dan Berbasis Data.
    `;

    // createReactAgent otomatis mengurus:
    // 1. Bind Tools ke Model
    // 2. Looping (Mikir -> Tool -> Mikir -> Jawab)
    this.agentGraph = createReactAgent({
      llm: llm,
      tools: machineTools,
      stateModifier: systemMessage, // Ini pengganti system prompt
    });
  }

/*************  ✨ Windsurf Command ⭐  *************/
  /**
   * Process a user's chat message and generate a response using LangGraph
   * @param {string} sessionId - unique identifier for the session
   * @param {string} userMessage - message from the user
   * @param {string} machineId - unique identifier for the machine
   * @returns {Promise<{sessionId: string, reply: string, timestamp: string}>} - object containing the session ID, response, and timestamp
   */

/*******  67359cd8-fdaf-4b6b-862f-c63e36aefec8  *******/  async processChat(sessionId, userMessage, machineId) {
    // 1. Session Management
    sessionId = await this._getOrCreateSession(sessionId);

    // 2. Ambil History dari DB
    // LangGraph butuh array message yang bersih
    const historyMessages = await this._getHistory(sessionId);

    // 3. Simpan Pesan User ke DB
    await prisma.chatMessage.create({
      data: { sessionId, content: userMessage, role: "user" },
    });

    let reply = "";

    try {
      // 4. JALANKAN AGENT (INVOKE GRAPH)
      // Kita kirim history + pesan baru
      const inputs = {
        messages: [...historyMessages, new HumanMessage(userMessage)],
      };

      // Config: recursionLimit mencegah loop tak terbatas jika agent bingung
      const result = await this.agentGraph.invoke(inputs, {
        recursionLimit: 10,
      });

      // Ambil pesan terakhir dari hasil eksekusi (itu adalah jawaban AI)
      const lastMessage = result.messages[result.messages.length - 1];
      reply = lastMessage.content;
    } catch (error) {
      console.error("LangGraph Error:", error);
      reply = "Maaf, sistem sedang mengalami gangguan teknis.";
    }

    // 5. Simpan Jawaban AI ke DB
    await prisma.chatMessage.create({
      data: { sessionId, content: reply, role: "assistant" },
    });

    // 6. Generate Title (Background)
    this._generateTitleIfNeeded(sessionId, userMessage);

    return {
      sessionId,
      reply,
      timestamp: new Date().toISOString(),
    };
  }

  // --- Helper Methods (Sama seperti sebelumnya) ---

  async _getOrCreateSession(sessionIdInput) {
    if (sessionIdInput) {
      const existing = await prisma.chatSession.findUnique({
        where: { id: sessionIdInput },
      });
      if (existing) return existing.id;
    }
    const newSession = await prisma.chatSession.create({ data: {} });
    return newSession.id;
  }

  async _getHistory(sessionId) {
    const chats = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 10, // Ambil 10 pesan terakhir
    });

    return chats.map((msg) => {
      if (msg.role === "user") return new HumanMessage(msg.content);
      return new AIMessage(msg.content); // Role 'assistant' jadi AIMessage
    });
  }

  async _generateTitleIfNeeded(sessionId, message) {
    try {
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (!session || session.title) return;
      const newTitle = message.split(" ").slice(0, 5).join(" ") + "...";
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { title: newTitle },
      });
    } catch (e) {}
  }
}

module.exports = new AgentService();
