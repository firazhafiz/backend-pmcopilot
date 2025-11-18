// src/controllers/sensorController.js
const { predictAnomaly, saveSensorData } = require("../services/sensorService");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const getSensorData = async (req, res) => {
  try {
    const { machineId } = req.params;
    const data = await prisma.sensorData.findMany({
      where: { machineId },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const predictAnomalyController = async (req, res) => {
  try {
    const result = await predictAnomaly(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const addSensor = async (req, res) => {
  try {
    const data = await saveSensorData(req.body);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getSensorData,
  predictAnomaly: predictAnomalyController,
  addSensor,
};
