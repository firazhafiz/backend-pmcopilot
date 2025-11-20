// src/services/machineCoreService.js
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
const config = require("../config");

const prisma = new PrismaClient();

const FAILURE_CLASSES = [
  "No Failure", "Power Failure", "Tool Wear Failure", 
  "Overstrain Failure", "Heat Dissipation Failure", "Random Failures"
];

class MachineCoreService {

  async getMachineStatus(machineId) {
    // 1. CEK CACHE (Gunakan logika longgar ala teman Anda)
    const cached = await this._checkCache(machineId);
    if (cached) {
      return cached;
    }

    // 2. PANGGIL ML API (Hanya jika benar-benar kosong)
    console.log(`[ML API] Mengambil data baru untuk ${machineId}...`);
    const mlRawData = await this._callMlApi(machineId);

    // 3. PARSING & VALIDASI
    const parsed = this._parseData(mlRawData);

    // 4. SIMPAN KE DB
    const savedData = await this._saveTransaction(machineId, parsed, mlRawData);
    
    return savedData;
  }

  // --- PRIVATE METHODS ---

  async _checkCache(machineId) {
    // A. Ambil Sensor Terakhir
    const cachedSensor = await prisma.sensorData.findFirst({
      where: { machineId },
      orderBy: { timestamp: "desc" },
      include: { machine: { select: { type: true } } },
    });

    if (!cachedSensor) return null;

    // B. Ambil Prediksi Terakhir (LOGIKA DIPERBAIKI)
    // Jangan gunakan 'where: { predictedAt: cachedSensor.timestamp }'
    // Gunakan orderBy desc seperti kode teman Anda agar ID dummy tetap kena cache.
    const cachedPrediction = await prisma.prediction.findFirst({
      where: { machineId },
      orderBy: { predictedAt: "desc" }, // Ambil yang paling baru saja
    });

    // C. Jika prediksi tidak ada sama sekali, baru return null (Lanjut ke API)
    if (!cachedPrediction) return null;

    // D. Return format standar
    return this._formatOutput(machineId, cachedSensor, cachedPrediction);
  }

  async _callMlApi(machineId) {
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
        const err = new Error(`Machine ID ${machineId} tidak ditemukan di sistem ML`);
        err.code = "MACHINE_NOT_FOUND";
        throw err;
      }
      throw new Error("Gagal menghubungi ML API: " + error.message);
    }
  }

  _parseData(ml) {
    // Parsing field dari API Python (Case Sensitive sesuai API teman Anda)
    const airTemp = parseFloat(ml["Air temperature [K]"]);
    const processTemp = parseFloat(ml["Process temperature [K]"]);
    const rotSpeed = parseInt(ml["Rotational speed [rpm]"]);
    const torque = parseFloat(ml["Torque [Nm]"]);
    const toolWear = parseInt(ml["Tool wear [min]"]);
    const type = ml["Type"] || "M";
    const failure = ml["Predicted Failure Type"] || "No Failure";

    // Validasi NaN
    if ([airTemp, processTemp, rotSpeed, torque, toolWear].some(isNaN)) {
      throw new Error("Data numerik dari ML API tidak valid (NaN)");
    }

    return {
      type,
      airTemp,
      processTemp,
      rotSpeed,
      torque,
      toolWear,
      failure,
      isFailure: failure !== "No Failure"
    };
  }

  async _saveTransaction(machineId, parsed, rawML) {
    const riskLevel = parsed.isFailure ? "high" : "low";
    const timestamp = new Date();

    await prisma.$transaction(async (tx) => {
      // Update Type Mesin
      await tx.machine.upsert({
        where: { id: machineId },
        update: { type: parsed.type },
        create: { id: machineId, name: `Machine ${machineId}`, type: parsed.type },
      });

      // Simpan Sensor
      await tx.sensorData.create({
        data: {
          machineId,
          airTemperature: parsed.airTemp,
          processTemperature: parsed.processTemp,
          rotationalSpeed: parsed.rotSpeed,
          torque: parsed.torque,
          toolWear: parsed.toolWear,
          timestamp: timestamp,
        },
      });

      // Simpan Prediksi
      await tx.prediction.create({
        data: {
          machineId,
          prediction: parsed.failure,
          predictionIndex: FAILURE_CLASSES.indexOf(parsed.failure),
          probability: 1.0, 
          rawOutput: rawML,
          riskLevel,
          recommendation: parsed.isFailure
            ? `TERDETEKSI ${parsed.failure.toUpperCase()}! Segera lakukan maintenance.`
            : `Mesin ${machineId} dalam kondisi normal.`,
          predictedAt: timestamp,
        },
      });
    });

    // Return format standar setelah save
    return {
        sensorData: {
            type: parsed.type,
            airTemperature: parsed.airTemp,
            processTemperature: parsed.processTemp,
            rotationalSpeed: parsed.rotSpeed,
            torque: parsed.torque,
            toolWear: parsed.toolWear,
            timestamp: timestamp,
        },
        predictionResult: {
            machineId,
            prediction: parsed.failure,
            probability: 1.0,
            riskLevel,
            recommendation: parsed.isFailure
                ? `TERDETEKSI ${parsed.failure.toUpperCase()}! Segera lakukan maintenance.`
                : `Mesin ${machineId} dalam kondisi normal.`,
            predictedAt: timestamp,
        }
    };
  }

  _formatOutput(machineId, sensor, prediction) {
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
        machineId,
        prediction: prediction.prediction,
        probability: prediction.probability,
        riskLevel: prediction.riskLevel,
        recommendation: prediction.recommendation,
        predictedAt: prediction.predictedAt,
      },
    };
  }
}

module.exports = new MachineCoreService();