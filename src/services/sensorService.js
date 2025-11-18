// src/services/sensorServices.js
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

async function predictAnomaly(machineId, sensorData) {
  try {
    if (!config.mlApiUrl) {
      throw new Error("ML_API_URL belum dikonfigurasi");
    }

    const payload = {
      Type: sensorData.type || "M",
      Air_temperature: sensorData.airTemperature,
      Process_temperature: sensorData.processTemperature,
      Rotational_speed: sensorData.rotationalSpeed,
      Torque: sensorData.torque,
      Tool_wear: sensorData.toolWear || 0,
    };

    let mlResult;
    try {
      const response = await axios.post(config.mlApiUrl, payload);
      mlResult = response.data;
    } catch (apiError) {
      console.error("External ML API Call Error:", apiError.message);
      throw new Error(
        "Gagal menghubungi atau memproses respons dari model prediksi."
      );
    }

    const rawArray = mlResult.raw_output[0];
    const maxProb = Math.max(...rawArray);
    const predictedIndex = rawArray.indexOf(maxProb);

    const predictedClass =
      mlResult.prediction || FAILURE_CLASSES[predictedIndex];
    const isFailure = predictedClass !== "No Failure";
    const riskLevel = isFailure ? "high" : "low";

    let saved;
    try {
      saved = await prisma.prediction.create({
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
    } catch (dbError) {
      console.error("Prisma Error during prediction save:", dbError.message);
      throw dbError;
    }

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
    throw error;
  }
}

async function saveSensorData(data) {
  try {
    return await prisma.sensorData.create({ data });
  } catch (dbError) {
    console.error("Prisma Error during sensor data save:", dbError.message);
    throw dbError;
  }
}

module.exports = { predictAnomaly, saveSensorData };
