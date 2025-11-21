// src/lib/cacheDB.js
const prisma = require("./prisma"); // <--- UBAH INI (Import Singleton)

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
    return { sensor, prediction };
  }
  return null;
}

module.exports = { getCachedPrediction };