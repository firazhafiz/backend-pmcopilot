// src/controllers/sensorController.js
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");
const { predictAnomaly, saveSensorData } = require("../services/sensorService");

const prisma = new PrismaClient();

// Schema untuk add sensor manual
const SensorDataSchema = z.object({
  machineId: z.string().min(1, "machineId harus diisi.").trim(),
  type: z.string().optional(),
  airTemperature: z.number().positive("Suhu udara harus positif"),
  processTemperature: z.number().positive("Suhu proses harus positif"),
  rotationalSpeed: z
    .number()
    .int()
    .positive("Kecepatan rotasi harus bilangan bulat positif"),
  torque: z.number().positive("Torsi harus positif"),
  toolWear: z
    .number()
    .int()
    .min(0, "Tool wear tidak boleh negatif")
    .optional()
    .default(0),
});

// Schema untuk predict (hanya machineId)
const PredictSchema = z.object({
  machineId: z.string().min(1, "machineId harus diisi").trim(),
});

// 1. GET SENSOR DATA (100 terbaru)
const getSensorData = async (req, res, next) => {
  try {
    const { machineId } = req.params;

    if (!machineId || machineId.trim() === "") {
      return res
        .status(400)
        .json({ error: "machineId di URL tidak boleh kosong" });
    }

    const data = await prisma.sensorData.findMany({
      where: { machineId: machineId.trim() },
      orderBy: { timestamp: "desc" },
      take: 100,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
};

// 2. PREDICT ANOMALY — NAMANYA predictAnomalyController (BIAR GAK BENTROK DENGAN SERVICE!)
const predictAnomalyController = async (req, res, next) => {
  try {
    const { machineId } = PredictSchema.parse(req.body);

    const result = await predictAnomaly(machineId); // INI DARI SERVICE

    return res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation Failed",
        details: err.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    }

    if (err.code === "MACHINE_NOT_FOUND") {
      return res.status(404).json({
        error: "Machine Not Found",
        message: `Machine ID "${req.body.machineId}" tidak tersedia di dataset ML.`,
        suggestion: "Pastikan ID mesin sesuai dengan data yang ada di sistem.",
      });
    }

    console.error("Predict Error:", err.message);
    return res.status(500).json({
      error: "Service Error",
      message: "Gagal memproses prediksi. Coba lagi nanti.",
    });
  }
};

// 3. ADD SENSOR DATA MANUAL
const addSensor = async (req, res, next) => {
  try {
    const validated = SensorDataSchema.parse(req.body);

    const dataToSave = {
      ...validated,
      machineId: validated.machineId.trim(),
      timestamp: new Date(),
    };

    const saved = await saveSensorData(dataToSave);
    return res.status(201).json(saved);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation Failed",
        details: err.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    }
    next(err);
  }
};

// EXPORT SEMUA — SESUAI DENGAN ROUTES KAMU!
module.exports = {
  getSensorData,
  predictAnomaly: predictAnomalyController, // INI YANG DIPANGGIL DI ROUTES
  addSensor,
};
