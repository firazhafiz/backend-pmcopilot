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

async function predictAnomaly(sensorData) {
  try {
    const machineId = sensorData.machineId || "UNKNOWN_MACHINE";

    if (!config.mlApiUrl) {
      throw new Error("ML_API_URL belum dikonfigurasi");
    }

    const payload = {
      Type: sensorData.type || "M",
      Air_temperature: sensorData.airTemperature,
      Process_temperature: sensorData.processTemperature,
      Rotational_speed: parseInt(sensorData.rotationalSpeed, 10),
      Torque: parseFloat(sensorData.torque),
      Tool_wear: parseInt(sensorData.toolWear || 0, 10),
    };

    const response = await axios.post(config.mlApiUrl, payload);
    const mlResult = response.data;

    const rawArray = mlResult.raw_output[0];
    const maxProb = Math.max(...rawArray);
    const predictedIndex = rawArray.indexOf(maxProb);

    const predictedClass =
      mlResult.prediction || FAILURE_CLASSES[predictedIndex];
    const isFailure = predictedClass !== "No Failure";
    const riskLevel = isFailure ? "high" : "low";

    const saved = await prisma.prediction.create({
      data: {
        machineId,
        prediction: predictedClass,
        predictionIndex: predictedIndex,
        probability: parseFloat(maxProb.toFixed(4)),
        rawOutput: mlResult.raw_output,
        riskLevel,
        recommendation: isFailure
          ? `TERDETEKSI ${predictedClass.toUpperCase()}! Segera lakukan maintenance preventif pada mesin ${machineId}.`
          : `Mesin ${machineId} dalam kondisi normal.`,
      },
    });

    return {
      machineId,
      prediction: predictedClass,
      predictionIndex: predictedIndex,
      probability: parseFloat(maxProb.toFixed(4)),
      riskLevel,
      recommendation: saved.recommendation,
      rawOutput: mlResult.raw_output,
      predictedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("ML API Error:", error.message);
    throw new Error("Gagal menghubungi model prediksi");
  }
}

async function saveSensorData(data) {
  return prisma.sensorData.create({ data });
}

module.exports = { predictAnomaly, saveSensorData };
