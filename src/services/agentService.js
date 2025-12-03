// src/agent/predictiveAgent.js
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const config = require("../config");
const { predictAnomaly } = require("../services/sensorService");
const prisma = require("../lib/prisma"); // Singleton Prisma

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.3, // Turunkan sedikit agar lebih faktual
  apiKey: config.googleApiKey,
});

// ... (Helper Functions: getHistoryFromDb, extractMachineId, generateTitle TETAP SAMA) ...
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

function generateTitle(message) {
  const words = message.trim().split(/\s+/);
  let title = words.slice(0, 5).join(" ");
  if (words.length > 5) title += "...";
  return title;
}
// ... (Akhir Helper Functions) ...


async function handleUserMessage(sessionId, userMessage) {
  try {
    // 1. Session & Title Logic (SAMA)
    const titleCandidate = generateTitle(userMessage);
    await prisma.chatSession.upsert({
      where: { id: sessionId },
      update: { updatedAt: new Date() },
      create: { 
        id: sessionId, 
        title: titleCandidate, 
        createdAt: new Date()
      },
    });

    // 2. History Logic (SAMA)
    let history = await getHistoryFromDb(sessionId);
    await prisma.chatMessage.create({
      data: { sessionId, content: userMessage, role: "user" },
    });
    history.push(new HumanMessage(userMessage));

    // 3. Logic Data Fetching (SAMA TAPI DENGAN UPDATE CONTEXT STRING)
    const machineId = extractMachineId(userMessage);
    let contextString = "";

    if (machineId) {
      try {
        const data = await predictAnomaly(machineId);
        
        // Kita juga perlu tampilkan Forecast agar AI bisa menjelaskan masa depan
        const forecastInfo = data.predictionResult.forecastFailureType !== "No Failure"
          ? `⚠️ PREDIKSI MASA DEPAN: ${data.predictionResult.forecastFailureType} (dalam ${data.predictionResult.forecastCountdown})`
          : "✅ Masa Depan: Tidak ada prediksi kerusakan.";

        contextString = `
        === [DATA MONITORING REAL-TIME: ${machineId}] ===
        Waktu Data: ${data.sensorData.timestamp}
        
        DATA SENSOR:
        - Tipe Mesin: ${data.sensorData.type}
        - Air Temperature: ${data.sensorData.airTemperature} K
        - Process Temperature: ${data.sensorData.processTemperature} K
        - Rotational Speed: ${data.sensorData.rotationalSpeed} RPM
        - Torque: ${data.sensorData.torque} Nm
        - Tool Wear: ${data.sensorData.toolWear} min
        
        STATUS AI:
        - Diagnosa Saat Ini: ${data.predictionResult.prediction}
        - ${forecastInfo}
        - Rekomendasi Sistem: "${data.predictionResult.recommendation}"
        =================================================
        `;
      } catch (err) {
        contextString = `[SYSTEM INFO] Gagal mengambil data untuk ID: ${machineId}.`;
      }
    }

    // 4. PROMPT ENGINEERING (UPDATED SESUAI PERMINTAAN)
    const systemInstruction = `
      PERAN: Anda adalah Ahli Predictive Maintenance AI untuk sistem manufaktur (Total 20 Mesin).

      PENGETAHUAN DASAR MESIN:
      1. SENSOR & KEGUNAAN:
         - Air temperature: Suhu lingkungan, indikator Heat Dissipation Failure.
         - Process temperature: Suhu internal proses, indikator Heat Dissipation Failure.
         - Rotational speed (RPM): Putaran mesin, indikator Power Failure.
         - Torque (Nm): Torsi beban, indikator Tool Wear Failure & Overstrain Failure.
         - Tool wear (min): Durasi pakai alat, indikator Tool Wear Failure.

      2. DEFINISI KEGAGALAN (THRESHOLD):
         - Tool Wear Failure [TWF]: Terjadi acak pada Tool Wear 200-240 menit. Solusi: Ganti part/tool.
         - Heat Dissipation Failure [HDF]: Terjadi jika selisih (Process Temp - Air Temp) < 8.6 K.
         - Power Failure [PWF]: Terjadi jika (Torque * Rotational Speed [rad/s]) < 3500 W atau > 9000 W.
         - Overstrain Failure [OSF]: Produk (Tool Wear * Torque) melebihi batas:
             * L-sized: > 11,000 minNm
             * M-sized: > 12,000 minNm
             * H-sized: > 13,000 minNm

      3. DATASET MESIN:
         - L-sized (12 unit): L_001 s/d L_012
         - M-sized (6 unit): M_001 s/d M_006
         - H-sized (2 unit): H_001 s/d H_002
      
      KONTEKS REAL-TIME (DATA FAKTA):
      ${contextString ? contextString : "Belum ada data mesin spesifik yang diminta user."}

      INSTRUKSI MENJAWAB:
      1. Analisis Data Fakta: Jika ada data mesin di atas, jelaskan *mengapa* mesin itu sehat atau rusak berdasarkan "DEFINISI KEGAGALAN" di atas.
         (Contoh: "Mesin ini mengalami HDF karena selisih suhunya hanya 5K, di bawah batas 8.6K").
      2. Gaya Bahasa: Profesional, teknis, namun mudah dimengerti teknisi.
      3. Batasan: Jangan menjawab hal di luar maintenance industri. Jika user bertanya "Siapa presiden?", tolak dengan sopan.
      4. Jika ada PREDIKSI MASA DEPAN di data fakta, peringatkan user dengan nada urgensi.
    `;

    // 5. Invoke Gemini (SAMA)
    const messagesToSend = [new HumanMessage(systemInstruction), ...history];
    const response = await llm.invoke(messagesToSend);
    const reply = response.content || "Maaf, tidak ada respon.";

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