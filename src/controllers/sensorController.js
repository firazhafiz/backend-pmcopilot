// src/controllers/sensorController.js
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");
const { predictAnomaly, saveSensorData } = require("../services/sensorService");
const prisma = new PrismaClient();

const SensorDataSchema = z.object({
  machineId: z.string().min(1, "machineId harus diisi."),
  type: z.string().optional(),
  airTemperature: z.number().positive(),
  processTemperature: z.number().positive(),
  rotationalSpeed: z.number().int().positive(),
  torque: z.number().positive(),
  toolWear: z.number().int().min(0).optional(),
});
const PredictSchema = SensorDataSchema.extend({});

const getSensorData = async (req, res, next) => {
  try {
    const { machineId } = req.params;

    if (!z.string().min(1).safeParse(machineId).success) {
      res.status(400);
      throw new Error("Invalid machineId format in URL.");
    }

    const data = await prisma.sensorData.findMany({
      where: { machineId },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const predictAnomalyController = async (req, res, next) => {
  try {
    const validatedData = PredictSchema.parse(req.body);

    const { machineId, ...sensorData } = validatedData;

    const result = await predictAnomaly(machineId, sensorData);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation Failed (Bad Request)",
        details: err.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    next(err);
  }
};

const addSensor = async (req, res, next) => {
  try {
    const validatedData = SensorDataSchema.parse(req.body);

    const data = await saveSensorData(validatedData);
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation Failed (Bad Request)",
        details: err.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    next(err);
  }
};

module.exports = {
  getSensorData,
  predictAnomaly: predictAnomalyController,
  addSensor,
};
