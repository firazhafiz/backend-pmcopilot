const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { HumanMessage } = require("@langchain/core/messages");
const config = require("../config");

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.3,
  apiKey: config.googleApiKey,
});

async function generateTicketContent(machineId, sensorData, prediction) {
  try {
    const prompt = `Peran: Asisten AI Predictive Maintenance.
Tugas: Buat konten tiket maintenance dalam Bahasa Indonesia yang profesional.

Berikan output JSON dengan keys persis: title, issue.
- title: ringkas (≤ 10 kata), jangan masukkan lagi machineId nya, fleksibel dan relevan dengan kondisi mesin, gunakan istilah teknis atau indikator utama bila perlu, tidak bergantung pada template, tidak perlu dipisah titik dua (:).
- issue: maksimum 4-5 kalimat yang mendeskripsikan isu dari informasi mesin: (1) ringkas forecast + countdown + waktu perkiraan, (2) sorot metrik sensor kunci termasuk delta suhu (process - air), RPM, torsi, dan tool wear, (3) korelasi ke skenario lapangan/dampak operasional, (4) tindakan rekomendasi yang dapat dieksekusi oleh teknisi.

Data:
Machine ID: ${machineId}
Sensor: ${JSON.stringify(sensorData)}
Prediction: ${JSON.stringify({
      forecast: prediction.forecast,
      recommendation: prediction.recommendation,
      predictedAt: prediction.predictedAt,
      timestamp: prediction.timestamp,
      countdown: prediction.countdown,
    })}
`;

    const res = await llm.invoke([new HumanMessage(prompt)]);
    const content = res.content || "{}";

    let parsed;
    try {
      const match = String(content).match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : content);
    } catch (e) {
      const baseTitle =
        prediction.forecast && prediction.forecast !== "No Failure"
          ? `${prediction.forecast} - ${machineId}`
          : `Investigasi Mesin ${machineId}`;
      const dateStr =
        prediction.predictedAt?.toISOString?.() ||
        prediction.predictedAt ||
        "unknown";
      parsed = {
        title: baseTitle,
        issue:
          `Mesin ${machineId}. Forecast: ${prediction.forecast}. Perkiraan waktu: ${dateStr}. ` +
          `Sensor: T_air=${sensorData.airTemperature}, T_proc=${sensorData.processTemperature}, RPM=${sensorData.rotationalSpeed}, Torque=${sensorData.torque}, Wear=${sensorData.toolWear}. ` +
          `Rekomendasi: ${
            prediction.recommendation || "Lakukan inspeksi terjadwal."
          }`,
      };
    }

    return {
      title: String(parsed.title || "Tiket Maintenance"),
      issue: String(
        parsed.issue ||
          parsed.description ||
          parsed.details ||
          "Deskripsi tidak tersedia"
      ),
    };
  } catch (err) {
    return {
      title: `Investigasi Mesin ${machineId}`,
      issue: `Gagal menghasilkan deskripsi AI. Gunakan data: ${JSON.stringify(
        { sensorData, prediction },
        null,
        2
      )}`,
    };
  }
}

module.exports = { llm, generateTicketContent };
