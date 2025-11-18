// src/agent/predictiveAgent.js
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { PrismaClient } = require("@prisma/client");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const config = require("../config");

// 🛑 FIX: Inisialisasi Prisma menggunakan DIRECT_URL
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.directDatabaseUrl, // Menggunakan koneksi langsung 5432
    },
  },
});

// Inisialisasi LLM
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.4,
  apiKey: config.googleApiKey,
});

/**
 * Mengambil riwayat pesan dari DB dan mengonversinya ke format Langchain.
 * @param {string} sessionId
 * @returns {Array<HumanMessage | AIMessage>}
 */
async function getHistoryFromDb(sessionId) {
  const chatMessages = await prisma.chatMessage.findMany({
    where: { sessionId: sessionId },
    orderBy: { createdAt: "asc" },
    // Batasi riwayat agar tidak terlalu panjang (misal: 20 pesan terakhir)
    take: 20,
  });

  // Konversi pesan dari DB ke format Langchain
  return chatMessages
    .map((msg) => {
      if (msg.role === "user") {
        return new HumanMessage(msg.content);
      } else if (msg.role === "ai") {
        return new AIMessage(msg.content);
      }
      return null; // Abaikan role yang tidak dikenal
    })
    .filter((msg) => msg !== null);
}

/**
 * Fungsi utama untuk menangani pesan pengguna dan menyimpan riwayat di DB.
 */
async function handleUserMessage(sessionId, userMessage) {
  try {
    // 1. Cek atau Buat Sesi Baru di DB (upsert)
    await prisma.chatSession.upsert({
      where: { id: sessionId },
      update: { updatedAt: new Date() },
      create: { id: sessionId },
    });

    // 2. Ambil Riwayat Percakapan dari DB
    let history = await getHistoryFromDb(sessionId);

    // 3. Simpan Pesan Pengguna ke DB
    await prisma.chatMessage.create({
      data: {
        sessionId: sessionId,
        content: userMessage,
        role: "user",
      },
    });

    // Tambahkan pesan user ke history Langchain
    history.push(new HumanMessage(userMessage));

    // 4. Siapkan Prompt dan Panggil Gemini
    const systemInstruction = `
          PERAN UTAMA: Kamu adalah asisten AI yang fokus HANYA PADA topik predictive maintenance (pemeliharaan mesin industri).
          
          Jawab dalam bahasa Indonesia yang ramah, jelas, dan profesional.
          
          SCOPE PENGETAHUAN ANDA:
          1. Kamu BISA menjawab pertanyaan teknis terkait pemeliharaan (misal: 'apa itu power failure', 'jelaskan tentang torsi', 'apa penyebab overheat').
          2. Kamu BISA menyarankan pengguna untuk mengambil data dari database (misal: 'Untuk data spesifik, silakan gunakan perintah /status [id_mesin]').
          3. Jaga konteks percakapan berdasarkan riwayat pesan sebelumnya.
          
          ATURAN KETAT (WAJIB DIIKUTI):
          - Jika pengguna bertanya sesuatu di luar scope pengetahuan Anda (misal: politik, cuaca, olahraga, selebriti, geografi umum, atau pertanyaan di luar konteks mesin industri), kamu HARUS menolak.
          - Jawaban penolakanmu HARUS sopan dan singkat.
          
          CONTOH PENOLAKAN:
          "Maaf, saya adalah asisten yang difokuskan pada pemeliharaan mesin. Saya tidak bisa menjawab pertanyaan di luar topik tersebut."
        `;

    // Gunakan systemInstruction sebagai pesan pertama, diikuti riwayat
    // Langchain akan mengurus format System/User/AI untuk history
    const messagesToSend = [new HumanMessage(systemInstruction), ...history];

    const response = await llm.invoke(messagesToSend);

    const reply =
      response.content || "Maaf, saya tidak bisa menjawab saat ini.";

    // 5. Simpan Pesan AI ke DB
    await prisma.chatMessage.create({
      data: {
        sessionId: sessionId,
        content: reply,
        role: "ai",
      },
    });

    return reply;
  } catch (error) {
    console.error("Gemini error:", error.message);
    if (process.env.NODE_ENV !== "production" && error.message) {
      console.error("Detail Error:", error.message);
    }
    // Pastikan error ini tidak memblokir server
    return "Maaf, layanan AI sedang bermasalah. Coba lagi dalam 1 menit.";
  }
}

module.exports = { handleUserMessage };
