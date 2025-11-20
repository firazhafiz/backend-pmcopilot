// src/services/sensorService.js
const { PrismaClient } = require("@prisma/client");
const machineCoreService = require("./machineCoreService"); // Import Core

const prisma = new PrismaClient();

// Wrapper agar tidak merusak controller dashboard yang sudah ada
const predictAnomaly = async (machineId) => {
  return await machineCoreService.getMachineStatus(machineId);
};

// Fungsi save manual (opsional, jika masih dipakai)
const saveSensorData = async (data) => {
  return await prisma.sensorData.create({ data });
};

module.exports = { predictAnomaly, saveSensorData };