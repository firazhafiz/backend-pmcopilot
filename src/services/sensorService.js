// src/services/sensorService.js
const prisma = require("../lib/prisma");
const { getCachedPrediction } = require("../lib/cacheDB");
const { callMlApi } = require("../lib/apiML");
const ticketService = require("./ticketService");

const FAILURE_CLASSES = [
  "No Failure",
  "Power Failure",
  "Tool Wear Failure",
  "Overstrain Failure",
  "Heat Dissipation Failure",
  "Random Failures",
  "Maintenance",
];

const inProgress = new Map();

async function predictAnomaly(machineId) {
  // 1. Cek Cache
  let cached = await getCachedPrediction(machineId);
  if (cached) return formatResponse(cached.sensor, cached.prediction);

  // 2. Anti Race
  if (inProgress.has(machineId)) {
    const result = await inProgress.get(machineId);
    return formatResponse(result.sensor, result.prediction);
  }

  // 3. Proses Baru
  const promise = (async () => {
    try {
      console.log(`[PROCESS] Fetch ML Data untuk ${machineId}`);
      let ml = await callMlApi(machineId);

      if (typeof ml === "string") {
        try {
          ml = JSON.parse(ml.replace(/'/g, '"'));
        } catch (e) {}
      }

      const type = ml["Type"] || "M";
      const currentFailure = ml["Predicted Failure Type"] || "No Failure";
      const forecastFailure = ml["Forecast Failure Type"] || "No Failure";

      const airTemp = parseFloat(ml["Air temperature [K]"]) || 0;
      const processTemp = parseFloat(ml["Process temperature [K]"]) || 0;
      const rotSpeed = parseInt(ml["Rotational speed [rpm]"]) || 0;
      const torque = parseFloat(ml["Torque [Nm]"]) || 0;
      const toolWear = parseInt(ml["Tool wear [min]"]) || 0;

      const isMaintenance = currentFailure === "Maintenance";

      if (!isMaintenance && [airTemp, processTemp].some((v) => isNaN(v))) {
        throw new Error("Data Sensor Invalid");
      }

      let riskLevel = "low";
      if (isMaintenance) riskLevel = "low";
      else if (
        currentFailure !== "No Failure" ||
        (forecastFailure !== "No Failure" && forecastFailure !== "Maintenance")
      )
        riskLevel = "high";

      let recommendation = `Mesin Berjalan Normal.`;
      if (isMaintenance) recommendation = "INFO: Maintenance Mode.";
      else if (currentFailure !== "No Failure")
        recommendation = `BAHAYA: ${currentFailure} terdeteksi!`;
      else if (
        forecastFailure !== "No Failure" &&
        forecastFailure !== "Maintenance"
      )
        recommendation = `PERINGATAN: Potensi ${forecastFailure} dalam ${
          ml["Forecast Failure Countdown"] || "waktu dekat"
        }. Tiket maintenance segera dibuat.`;

      // 🛑 TANGKAP HASIL TIKET DARI TRANSAKSI
      const newTicket = await prisma.$transaction(async (tx) => {
        // 1. Machine
        await tx.machine.upsert({
          where: { id: machineId },
          update: { type },
          create: { id: machineId, type },
        });

        // 2. Sensor
        await tx.sensorData.create({
          data: {
            machineId,
            airTemperature: airTemp,
            processTemperature: processTemp,
            rotationalSpeed: rotSpeed,
            torque,
            toolWear,
            timestamp: new Date(),
          },
        });

        // 3. Prediction
        await tx.prediction.create({
          data: {
            machineId,
            prediction: currentFailure,
            predictionIndex: FAILURE_CLASSES.indexOf(currentFailure),
            probability: 1.0,
            rawOutput: ml,
            riskLevel,
            recommendation,
            predictedAt: new Date(),
          },
        });

        // 4. AUTO TICKET (Return hasilnya)
        return await ticketService.processAutoTicket(
          tx,
          machineId,
          ml,
          currentFailure,
          forecastFailure
        );
      });

      const fresh = await getCachedPrediction(machineId);

      // Kembalikan data fresh + info tiket baru
      return { ...fresh, newTicket };
    } catch (error) {
      throw error;
    } finally {
      inProgress.delete(machineId);
    }
  })();

  inProgress.set(machineId, promise);
  const result = await promise;
  // Passing newTicket ke formatter
  return formatResponse(result.sensor, result.prediction, result.newTicket);
}

// ... (getAllMachinesFullData SAMA) ...
async function getAllMachinesFullData() {
  // ... kode sama ...
  const machines = await prisma.machine.findMany({
    orderBy: { id: "asc" },
    include: {
      sensorReadings: { orderBy: { timestamp: "desc" }, take: 100 },
      predictions: { orderBy: { predictedAt: "desc" }, take: 100 },
      tickets: { where: { status: "open" }, orderBy: { createdAt: "desc" } },
    },
  });
  return machines;
}

// 🛑 FORMATTER DIPERBAIKI (Agar Frontend dapat Notif)
function formatResponse(sensor, prediction, newTicket = null) {
  const raw = prediction.rawOutput || {};
  return {
    sensorData: {
      type: sensor.machine?.type || "M",
      airTemperature: sensor.airTemperature,
      processTemperature: sensor.processTemperature,
      rotationalSpeed: sensor.rotationalSpeed,
      torque: sensor.torque,
      toolWear: sensor.toolWear,
      timestamp: sensor.timestamp,
    },
    predictionResult: {
      machineId: prediction.machineId,
      prediction: prediction.prediction,
      probability: prediction.probability || 1.0,
      riskLevel: prediction.riskLevel,
      recommendation: prediction.recommendation,
      predictedAt: prediction.predictedAt,
      forecastFailureType: raw["Forecast Failure Type"] || "No Failure",
      forecastTimestamp: raw["Forecast Failure Timestamp"] || null,
      forecastCountdown: raw["Forecast Failure Countdown"] || null,
    },
    // INI YANG DITUNGGU FRONTEND UNTUK POPUP NOTIFIKASI
    generatedTicket: newTicket
      ? {
          id: newTicket.id,
          title: newTicket.title,
          priority: newTicket.priority,
          isNew: true,
        }
      : null,
  };
}

module.exports = { predictAnomaly, getAllMachinesFullData };
