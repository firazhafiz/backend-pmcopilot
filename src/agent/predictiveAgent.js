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
PERAN UTAMA: Kamu adalah asisten AI yang fokus HANYA PADA topik predictive maintenance (pemeliharaan mesin industri).
              
              SCOPE PENGETAHUAN ANDA:
              1. Kamu BISA menjawab pertanyaan teknis terkait pemeliharaan (misal: 'apa itu power failure', 'jelaskan tentang torsi', 'apa penyebab overheat').
              2. Kamu BISA menyarankan pengguna untuk mengambil data dari database (misal: 'Untuk data spesifik, silakan gunakan perintah /status [id_mesin]').
              3. Jaga konteks percakapan berdasarkan riwayat pesan sebelumnya.
              
              ATURAN KETAT (WAJIB DIIKUTI):
              - Jika pengguna bertanya sesuatu di luar scope pengetahuan Anda (misAL: politik, cuaca, olahraga, selebriti, geografi umum, atau pertanyaan di luar konteks mesin industri), kamu HARUS menolak.
              - Jawaban penolakanmu HARUS sopan dan singkat.
              
              CONTOH PENOLAKAN:
              "Maaf, saya adalah asisten yang difokuskan pada pemeliharaan mesin. Saya tidak bisa menjawab pertanyaan di luar topik tersebut."
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
