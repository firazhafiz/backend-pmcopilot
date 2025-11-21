// src/agent/predictiveAgent.js
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const config = require("../config");
const { predictAnomaly } = require("../services/sensorService");

// Gunakan Singleton Prisma (Wajib agar tidak error connection)
const prisma = require("../lib/prisma");

// Inisialisasi LLM
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.4,
  apiKey: config.googleApiKey,
});

async function getHistoryFromDb(sessionId) {
  const chatMessages = await prisma.chatMessage.findMany({
    where: { sessionId: sessionId },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  return chatMessages
    .map((msg) => {
      if (msg.role === "user") return new HumanMessage(msg.content);
      if (msg.role === "ai") return new AIMessage(msg.content);
      return null;
    })
    .filter((msg) => msg !== null);
}

function extractMachineId(text) {
  const match = text.match(/\b([A-Z]+_?\d+)\b/i);
  const id = match ? match[1].toUpperCase() : null;
  if (id) console.log(`🕵️ [AGENT] Regex menemukan ID: ${id}`);
  return id;
}

/**
 * Helper: Generate Title (5 Kata Pertama)
 */
function generateTitle(message) {
  // Pecah berdasarkan spasi (menangani spasi ganda juga)
  const words = message.trim().split(/\s+/);
  
  // Ambil 5 kata pertama
  let title = words.slice(0, 5).join(" ");
  
  // Jika aslinya lebih dari 5 kata, tambah "..."
  if (words.length > 5) {
    title += "...";
  }
  
  return title;
}

async function handleUserMessage(sessionId, userMessage) {
  try {
    // 1. GENERATE TITLE CANDIDATE
    const titleCandidate = generateTitle(userMessage);

    // 2. Upsert Session
    // Title HANYA disimpan saat 'create' (pesan pertama).
    // Saat 'update' (chat lanjut), title tidak diubah agar konsisten.
    await prisma.chatSession.upsert({
      where: { id: sessionId },
      update: { 
        updatedAt: new Date() 
      },
      create: { 
        id: sessionId, 
        title: titleCandidate, // <--- Title otomatis masuk sini
        createdAt: new Date()
      },
    });

    // 3. History & Save User Message
    let history = await getHistoryFromDb(sessionId);
    await prisma.chatMessage.create({
      data: { sessionId, content: userMessage, role: "user" },
    });
    history.push(new HumanMessage(userMessage));

    // 4. Logic Pengambilan Data Mesin
    const machineId = extractMachineId(userMessage);
    let contextString = "";

    if (machineId) {
      try {
        const data = await predictAnomaly(machineId);
        
        contextString = `
        === [DATA MONITORING REAL-TIME: ${machineId}] ===
        Waktu Data: ${data.sensorData.timestamp}
        SENSOR:
        - Tipe Mesin: ${data.sensorData.type}
        - Suhu Udara: ${data.sensorData.airTemperature} K
        - Suhu Proses: ${data.sensorData.processTemperature} K
        - RPM: ${data.sensorData.rotationalSpeed}
        - Torsi: ${data.sensorData.torque} Nm
        - Tool Wear: ${data.sensorData.toolWear} min
        
        PREDIKSI AI (RISIKO: ${data.predictionResult.riskLevel.toUpperCase()}):
        - Status: ${data.predictionResult.prediction}
        - Rekomendasi: "${data.predictionResult.recommendation}"
        =================================================
        `;
      } catch (err) {
        console.error(`⚠️ [AGENT] Gagal mengambil data ${machineId}: ${err.message}`);
        contextString = `[SYSTEM INFO] Gagal mengambil data untuk ID: ${machineId}.`;
      }
    }

    // 5. Prompt System
    const systemInstruction = `
      PERAN: Kamu adalah Asisten AI Predictive Maintenance.
      
      ${contextString ? `DATA FAKTA (WAJIB DIGUNAKAN):\n${contextString}` : "STATUS: Tidak ada data mesin spesifik."}

      ATURAN:
      1. Jika ada failure, berikan peringatan tegas.
      2. Jika normal, katakan aman tapi tetap pantau.
      3. Tolak pertanyaan di luar topik maintenance industri.
    `;

    // 6. Invoke Gemini
    const messagesToSend = [new HumanMessage(systemInstruction), ...history];
    const response = await llm.invoke(messagesToSend);
    const reply = response.content || "Maaf, tidak ada respon.";

    // 7. Simpan Reply AI
    await prisma.chatMessage.create({
      data: { sessionId, content: reply, role: "ai" },
    });

    return reply;

  } catch (error) {
    console.error("🔥 [AGENT ERROR]:", error);
    return "Maaf, sistem sedang gangguan.";
  }
}

module.exports = { handleUserMessage };