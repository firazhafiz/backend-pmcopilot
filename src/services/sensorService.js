// src/services/sensorService.js
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
const config = require("../config");

const prisma = new PrismaClient();

const FAILURE_CLASSES = [
  "No Failure",
  "Power Failure",
  "Tool Wear Failure",
  "Overstrain Failure",
  "Heat Dissipation Failure",
  "Random Failures",
];

async function callMlApi(machineId) {
  if (!config.mlApiUrl) {
    throw new Error("ML_API_URL belum diset di .env");
  }

  try {
    const response = await axios.post(
      config.mlApiUrl,
      { MachineID: machineId },
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      const err = new Error("Machine ID tidak ditemukan");
      err.code = "MACHINE_NOT_FOUND";
      throw err;
    }
    throw new Error("Gagal menghubungi ML API");
  }
}

const predictAnomaly = async (machineId) => {
  // 1. Cek cache DB dulu
  const cachedSensor = await prisma.sensorData.findFirst({
    where: { machineId },
    orderBy: { timestamp: "desc" },
    include: { machine: { select: { type: true } } },
  });

  const cachedPrediction = await prisma.prediction.findFirst({
    where: { machineId },
    orderBy: { predictedAt: "desc" },
  });

  if (cachedSensor && cachedPrediction) {
    console.log(`[CACHE HIT] Data ${machineId} dari database`);
    return {
      sensorData: {
        type: cachedSensor.machine?.type || "M",
        airTemperature: cachedSensor.airTemperature,
        processTemperature: cachedSensor.processTemperature,
        rotationalSpeed: cachedSensor.rotationalSpeed,
        torque: cachedSensor.torque,
        toolWear: cachedSensor.toolWear,
        timestamp: cachedSensor.timestamp,
      },
      predictionResult: {
        machineId,
        prediction: cachedPrediction.prediction,
        probability: cachedPrediction.probability,
        riskLevel: cachedPrediction.riskLevel,
        recommendation: cachedPrediction.recommendation,
        predictedAt: cachedPrediction.predictedAt,
      },
    };
  }

  // 2. Panggil ML API
  console.log(`[ML API] Mengambil data untuk ${machineId}...`);
  const ml = await callMlApi(machineId);

  const airTemp = parseFloat(ml["Air temperature [K]"]);
  const processTemp = parseFloat(ml["Process temperature [K]"]);
  const rotSpeed = parseInt(ml["Rotational speed [rpm]"]);
  const torque = parseFloat(ml["Torque [Nm]"]);
  const toolWear = parseInt(ml["Tool wear [min]"]);
  const type = ml["Type"] || "M";
  const failure = ml["Predicted Failure Type"] || "No Failure";

  if (
    isNaN(airTemp) ||
    isNaN(processTemp) ||
    isNaN(rotSpeed) ||
    isNaN(torque) ||
    isNaN(toolWear)
  ) {
    throw new Error("Data dari ML API tidak valid");
  }

  const isFailure = failure !== "No Failure";
  const riskLevel = isFailure ? "high" : "low";

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
        recommendation: isFailure
          ? `TERDETEKSI ${failure.toUpperCase()}! Segera lakukan maintenance pada ${machineId}.`
          : `Mesin ${machineId} dalam kondisi normal.`,
      },
    });
  });

  return {
    sensorData: {
      type,
      airTemperature: airTemp,
      processTemperature: processTemp,
      rotationalSpeed: rotSpeed,
      torque,
      toolWear,
      timestamp: new Date().toISOString(),
    },
    predictionResult: {
      machineId,
      prediction: failure,
      probability: 1.0,
      riskLevel,
      recommendation: isFailure
        ? `TERDETEKSI ${failure.toUpperCase()}! Segera lakukan maintenance pada ${machineId}.`
        : `Mesin ${machineId} dalam kondisi normal.`,
      predictedAt: new Date().toISOString(),
    },
  };
};

const saveSensorData = async (data) => {
  return await prisma.sensorData.create({ data });
};

module.exports = { predictAnomaly, saveSensorData };
