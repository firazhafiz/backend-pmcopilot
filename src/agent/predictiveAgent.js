const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { PrismaClient } = require("@prisma/client");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const config = require("../config");

const prisma = new PrismaClient();

const sessions = {};

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.4,
  config: {
    apiKey: config.googleApiKey,
  },
});
// --------------------------------------------------------

async function handleUserMessage(sessionId, userMessage) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = [];
  }

  sessions[sessionId].push(new HumanMessage(userMessage));

  try {
    const historyMessages = sessions[sessionId]
      .map((m) => m.content)
      .join("\n");

    const systemInstruction = `
      Kamu adalah Predictive Maintenance Copilot untuk perusahaan energi (pembangkit listrik, oil & gas).
      Jawab dalam bahasa Indonesia yang ramah, jelas, dan profesional.
      
      INSTRUKSI KHUSUS (Prioritaskan instruksi ini):
      - Karena saat ini database kosong dan ML server sedang offline, SEMUA jawaban harus menyertakan informasi bahwa: "belum ada data sensor masuk karena ML server sedang offline" ATAU "belum ada prediksi karena server ML belum nyala."
      - Jaga konteks percakapan berdasarkan riwayat pesan sebelumnya.

      Contoh jawaban:
      - "Halo! Saat ini belum ada data sensor masuk karena ML server sedang offline. Tapi saya siap bantu kalau ada pertanyaan lain!"
      - "Maaf, belum ada prediksi karena server ML belum nyala. Nanti kalau sudah hidup, saya bisa kasih info real-time!"
    `;

    const messages = [
      new HumanMessage(systemInstruction),
      ...sessions[sessionId],
    ];

    const response = await llm.invoke(messages);

    const reply =
      response.content || "Maaf, saya tidak bisa menjawab saat ini.";

    sessions[sessionId].push(new AIMessage(reply));

    return reply;
  } catch (error) {
    console.error("Gemini error:", error.message);
    if (process.env.NODE_ENV !== "production" && error.message) {
      console.error("Detail Error:", error.message);
    }
    return "Maaf, layanan AI sedang bermasalah. Coba lagi dalam 1 menit.";
  }
}

module.exports = { handleUserMessage };
