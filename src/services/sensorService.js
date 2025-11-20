// src/services/sensorService.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { getCachedPrediction } = require("../lib/cacheDB");
const { callMlApi } = require("../lib/apiML");

const FAILURE_CLASSES = [
  "No Failure",
  "Power Failure",
  "Tool Wear Failure",
  "Overstrain Failure",
  "Heat Dissipation Failure",
  "Random Failures",
];

const inProgress = new Map(); // anti race-condition

async function predictAnomaly(machineId) {
  // 1. Cek cache dulu
  let cached = await getCachedPrediction(machineId);
  if (cached) {
    // KALO ADA CACHE → langsung format sesuai yang diharapkan semua orang
    return formatResponse(cached.sensor, cached.prediction);
  }

  // 2. Kalau ada yang lagi proses → tunggu
  if (inProgress.has(machineId)) {
    console.log(`[LOCK] Menunggu proses lain untuk ${machineId}`);
    const result = await inProgress.get(machineId);
    return formatResponse(result.sensor, result.prediction);
  }

  // 3. Kita yang proses baru
  const promise = (async () => {
    try {
      console.log(`[ML CALL + SAVE] Proses baru untuk ${machineId}`);
      const ml = await callMlApi(machineId);

      const airTemp = parseFloat(ml["Air temperature [K]"]);
      const processTemp = parseFloat(ml["Process temperature [K]"]);
      const rotSpeed = parseInt(ml["Rotational speed [rpm]"]);
      const torque = parseFloat(ml["Torque [Nm]"]);
      const toolWear = parseInt(ml["Tool wear [min]"]);
      const type = ml["Type"] || "M";
      const failure = ml["Predicted Failure Type"] || "No Failure";

      if ([airTemp, processTemp, rotSpeed, torque, toolWear].some(isNaN)) {
        throw new Error("Data dari ML API tidak valid");
      }

      const isFailure = failure !== "No Failure";
      const riskLevel = isFailure ? "high" : "low";
      const recommendation = isFailure
        ? `TERDETEKSI ${failure.toUpperCase()}! Segera lakukan maintenance pada ${machineId}.`
        : `Mesin ${machineId} dalam kondisi normal.`;

      await prisma.$transaction(async (tx) => {
        await tx.machine.upsert({
          where: { id: machineId },
          update: { type },
          create: { id: machineId, type },
        });

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

        await tx.prediction.create({
          data: {
            machineId,
            prediction: failure,
            predictionIndex: FAILURE_CLASSES.indexOf(failure),
            probability: 1.0,
            rawOutput: ml,
            riskLevel,
            recommendation,
          },
        });
      });

      // Ambil yang terbaru dari DB
      const fresh = await getCachedPrediction(machineId);
      if (!fresh) throw new Error("Gagal menyimpan ke DB");

      return fresh; // { sensor, prediction }
    } catch (error) {
      throw error;
    } finally {
      inProgress.delete(machineId);
    }
  })();

  inProgress.set(machineId, promise);
  const result = await promise;

  // SELALU return dalam format yang SAMA dengan versi lama
  return formatResponse(result.sensor, result.prediction);
}

// Helper biar format return selalu konsisten (ini yang bikin nggak error lagi)
function formatResponse(sensor, prediction) {
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
    },
  };
}

module.exports = { predictAnomaly };
