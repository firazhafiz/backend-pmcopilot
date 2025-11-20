// src/services/cacheService.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function getCachedPrediction(machineId) {
  const [sensor, prediction] = await Promise.all([
    prisma.sensorData.findFirst({
      where: { machineId },
      orderBy: { timestamp: "desc" },
      include: { machine: { select: { type: true } } },
    }),
    prisma.prediction.findFirst({
      where: { machineId },
      orderBy: { predictedAt: "desc" },
    }),
  ]);

  if (sensor && prediction) {
    console.log(`[CACHE HIT] Data ${machineId} dari database`);
    return { sensor, prediction };
  }

  return null;
}

module.exports = { getCachedPrediction };
