// src/services/sensorService.js
/**
 * Sensor Service
 * Core business logic untuk ML prediction, sensor data storage, dan caching
 */

const prisma = require("../lib/prisma");
const redis = require("../lib/redis");
const { callMlApi, callMlApiFullRequest } = require("../lib/apiML");
const { parseMLResponse } = require("../utils/mlPayloadMapper");
const {
  ExternalServiceError,
  DatabaseError,
  NotFoundError,
  ValidationError,
} = require("../utils/customError");

const CACHE_TTL_SECONDS = 3300; // 55 minutes
const inProgress = new Map(); // Anti race-condition

// ==========================================
// REDIS CACHE HELPERS
// ==========================================

async function getPredictionFromRedis(machineId) {
  try {
    const key = `ml_prediction:${machineId}`;
    const cachedData = await redis.get(key);

    if (cachedData) {
      console.log(`[CACHE] HIT - Redis for ${machineId}`);
      return JSON.parse(cachedData);
    }
    return null;
  } catch (error) {
    console.warn(`[CACHE] Redis get error for ${machineId}:`, error.message);
    return null; // Fallback ke DB jika Redis error
  }
}

async function setPredictionToRedis(machineId, data) {
  try {
    const key = `ml_prediction:${machineId}`;
    await redis.set(key, JSON.stringify(data), "EX", CACHE_TTL_SECONDS);
    console.log(
      `[CACHE] SET - Redis ${machineId} (TTL: ${CACHE_TTL_SECONDS}s)`
    );
  } catch (error) {
    console.warn(`[CACHE] Redis set error for ${machineId}:`, error.message);
    // Non-blocking: jika Redis gagal, lanjut ke DB
  }
}

// ==========================================
// CORE: PREDICT ANOMALY
// ==========================================

async function predictAnomaly(machineId) {
  try {
    // 1. Check Redis cache (fastest)
    const redisCache = await getPredictionFromRedis(machineId);
    if (redisCache) {
      return redisCache;
    }

    // 2. Prevent race condition: wait if already processing
    if (inProgress.has(machineId)) {
      console.log(`[LOCK] Waiting for in-progress request for ${machineId}`);
      return inProgress.get(machineId);
    }

    // 3. Call ML API and save data
    const promise = processNewPrediction(machineId);
    inProgress.set(machineId, promise);

    return promise;
  } catch (error) {
    inProgress.delete(machineId);
    throw error;
  }
}

/**
 * Process new prediction dari ML API
 */
async function processNewPrediction(machineId) {
  try {
    console.log(`[ML] Calling API for ${machineId}`);
    const startTime = Date.now();

    // Call ML API
    const mlResponse = await callMlApi(machineId);
    const duration = Date.now() - startTime;
    console.log(`[ML] API latency: ${duration}ms`);

    // Parse & validate ML response
    const { sensorData, prediction } = parseMLResponse(mlResponse);

    // Save to database (transaction) - will auto-create ticket if threshold met
    const createdTicket = await savePredictionData(sensorData, prediction);

    // Format response (cleanups duplicate data, normalizes timestamps)
    const formatted = formatResponse(sensorData, prediction);

    // Always include a ticket field (either the created ticket object or null)
    formatted.ticket = createdTicket || null;

    // Cache in Redis
    await setPredictionToRedis(machineId, formatted);

    return formatted;
  } catch (error) {
    throw error;
  } finally {
    inProgress.delete(machineId);
  }
}

/**
 * Save machine + prediction data to database.
 * HANYA membuat record Prediction & Ticket untuk mesin
 * yang memiliki forecast failure di masa depan.
 */
async function savePredictionData(sensorData, prediction) {
  try {
    const hasForecastFailure =
      prediction.forecast &&
      prediction.forecast !== "No Failure" &&
      prediction.forecast !== null;

    await prisma.$transaction(async (tx) => {
      await tx.machine.upsert({
        where: { id: sensorData.machineId },
        update: {
          type: sensorData.machineType,
          airTemperature: Number(sensorData.airTemperature),
          processTemperature: Number(sensorData.processTemperature),
          rotationalSpeed:
            sensorData.rotationalSpeed != null
              ? Math.round(Number(sensorData.rotationalSpeed))
              : null,
          torque: Number(sensorData.torque),
          toolWear:
            sensorData.toolWear != null
              ? Math.round(Number(sensorData.toolWear))
              : null,
          sensorTimestamp: sensorData.timestamp,
        },
        create: {
          id: sensorData.machineId,
          type: sensorData.machineType,
          airTemperature: Number(sensorData.airTemperature),
          processTemperature: Number(sensorData.processTemperature),
          rotationalSpeed:
            sensorData.rotationalSpeed != null
              ? Math.round(Number(sensorData.rotationalSpeed))
              : null,
          torque: Number(sensorData.torque),
          toolWear:
            sensorData.toolWear != null
              ? Math.round(Number(sensorData.toolWear))
              : null,
          sensorTimestamp: sensorData.timestamp,
        },
      });

      if (hasForecastFailure) {
        let forecastTs = null;
        try {
          const rawTs = prediction.rawPayload?.forecastFailureTimestampRaw;
          if (rawTs) {
            const parsed = Date.parse(rawTs);
            if (!isNaN(parsed)) forecastTs = new Date(parsed);
          }
        } catch (_) {}
        forecastTs = forecastTs || prediction.predictedAt || null;
        await tx.prediction.create({
          data: {
            machineId: sensorData.machineId,
            prediction: prediction.prediction,
            forecast: prediction.forecast,
            recommendation: prediction.recommendation,
            predictedAt: prediction.predictedAt,
            rawPayload: prediction.rawPayload,
            forecastFailureTimestamp: forecastTs,
          },
        });
      }
    });

    let createdTicket = null;
    if (hasForecastFailure) {
      const { generateTicketContent } = require("../lib/agenticAI");
      const ticketContent = await generateTicketContent(
        sensorData.machineId,
        {
          type: sensorData.machineType,
          airTemperature: sensorData.airTemperature,
          processTemperature: sensorData.processTemperature,
          rotationalSpeed: sensorData.rotationalSpeed,
          torque: sensorData.torque,
          toolWear: sensorData.toolWear,
        },
        {
          forecast: prediction.forecast,
          recommendation: prediction.recommendation,
          predictedAt: prediction.predictedAt,
          timestamp: prediction.rawPayload?.forecastFailureTimestampRaw || null,
          countdown: prediction.rawPayload?.forecastFailureCountdownRaw || null,
        }
      );

      const priority = "MEDIUM";
      createdTicket = await prisma.maintenanceTicket.create({
        data: {
          machineId: sensorData.machineId,
          title: ticketContent.title,
          issue: ticketContent.issue,
          status: true,
          priority,
          expectedFailureAt: prediction.predictedAt,
        },
      });
    }

    return createdTicket;
  } catch (error) {
    if (error.code?.startsWith("P")) {
      console.error("[DB] Prisma error while saving prediction:", {
        code: error.code,
        message: error.message,
        meta: error.meta,
      });
      throw new DatabaseError("Failed to save prediction data to database", {
        message: error.message,
        code: error.code,
        meta: error.meta,
      });
    }
    throw error;
  }
}

// ==========================================
// GET: ALL MACHINES DATA
// ==========================================

async function getAllMachinesFullData(
  limit = 50,
  offset = 0,
  _riskLevel = null
) {
  try {
    const where = {};

    // Sequential execution untuk menghindari terlalu banyak koneksi bersamaan
    // Count query lebih ringan, jadi bisa dijalankan terlebih dahulu
    const total = await prisma.machine.count({ where });
    const machines = await prisma.machine.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { id: "asc" },
      include: {
        predictions: {
          orderBy: { predictedAt: "desc" },
          take: 1, // Latest only
        },
        tickets: {
          // Urutkan berdasarkan countdown terendah (expectedFailureAt terdekat)
          orderBy: [
            { expectedFailureAt: "asc" }, // Countdown terendah dulu
            { createdAt: "desc" }, // Fallback ke created terbaru
          ],
          take: 5, // Latest 5 tickets
        },
      },
    });

    console.log(`[DB] Fetched ${machines.length} machines (total: ${total})`);

    // Format machines array sesuai 3 varian
    // Semua machines ditampilkan (tidak skip yang tidak punya prediction)
    const formattedMachines = machines.map((machine) => {
      const latestPrediction = machine.predictions?.[0];

      // Jika tidak ada prediction dan tidak ada snapshot, return dengan data minimal
      if (!latestPrediction && !machine.sensorTimestamp) {
        return {
          machineId: machine.id,
          sensorData: {
            type: machine.type,
            airTemperature: null,
            processTemperature: null,
            rotationalSpeed: null,
            torque: null,
            toolWear: null,
            timestamp: null,
            classification: "Unknown",
          },
        };
      }

      // Determine machine variant berdasarkan prediction
      const isMaintenance =
        latestPrediction?.prediction === "Maintenance" ||
        latestPrediction?.rawPayload?.predictedFailureType === "Maintenance";
      const hasForecastFailure =
        latestPrediction &&
        latestPrediction.forecast &&
        latestPrediction.forecast !== "No Failure" &&
        latestPrediction.forecast !== null;

      // Varian 1: Maintenance - hanya sensorData + classification
      if (isMaintenance) {
        return {
          machineId: machine.id,
          sensorData: {
            type: machine.type,
            airTemperature: machine.airTemperature ?? 0.0,
            processTemperature: machine.processTemperature ?? 0.0,
            rotationalSpeed: machine.rotationalSpeed ?? 0,
            torque: machine.torque ?? 0.0,
            toolWear: machine.toolWear ?? 0,
            timestamp: machine.sensorTimestamp
              ? new Date(machine.sensorTimestamp).toISOString()
              : null,
            classification:
              latestPrediction?.rawPayload?.predictedFailureType ||
              latestPrediction?.prediction ||
              "Maintenance",
          },
        };
      }

      // Varian 2: Normal tanpa Forecast - sensorData + classification
      if (!hasForecastFailure) {
        return {
          machineId: machine.id,
          sensorData: {
            type: machine.type,
            airTemperature:
              machine.airTemperature != null
                ? Number(Number(machine.airTemperature).toFixed(2))
                : null,
            processTemperature:
              machine.processTemperature != null
                ? Number(Number(machine.processTemperature).toFixed(2))
                : null,
            rotationalSpeed: machine.rotationalSpeed ?? null,
            torque:
              machine.torque != null
                ? Number(Number(machine.torque).toFixed(2))
                : null,
            toolWear: machine.toolWear ?? null,
            timestamp: machine.sensorTimestamp
              ? new Date(machine.sensorTimestamp).toISOString()
              : null,
            classification:
              latestPrediction?.rawPayload?.predictedFailureType ||
              latestPrediction?.prediction ||
              "No Failure",
          },
        };
      }

      // Varian 3: Normal dengan Forecast - sensorData + predicted + ticket
      const predicted = {
        forecast: latestPrediction.forecast,
        recommendation: latestPrediction.recommendation,
        predictedAt: latestPrediction.predictedAt
          ? new Date(latestPrediction.predictedAt).toISOString()
          : null,
        timestamp: latestPrediction.forecastFailureTimestamp
          ? new Date(latestPrediction.forecastFailureTimestamp).toISOString()
          : latestPrediction.rawPayload?.forecastFailureTimestampRaw || null,
        countdown:
          latestPrediction.rawPayload?.forecastFailureCountdownRaw || null,
      };

      return {
        machineId: machine.id,
        sensorData: {
          type: machine.type,
          airTemperature:
            machine.airTemperature != null
              ? Number(Number(machine.airTemperature).toFixed(2))
              : null,
          processTemperature:
            machine.processTemperature != null
              ? Number(Number(machine.processTemperature).toFixed(2))
              : null,
          rotationalSpeed: machine.rotationalSpeed ?? null,
          torque:
            machine.torque != null
              ? Number(Number(machine.torque).toFixed(2))
              : null,
          toolWear: machine.toolWear ?? null,
          timestamp: machine.sensorTimestamp
            ? new Date(machine.sensorTimestamp).toISOString()
            : null,
          classification:
            latestPrediction.rawPayload?.predictedFailureType ||
            latestPrediction.prediction ||
            "No Failure",
        },
        predicted,
        ticket: machine.tickets?.[0] || null, // Ticket terbaru dengan countdown terendah
      };
    });

    return {
      data: formattedMachines,
      total: formattedMachines.length,
    };
  } catch (error) {
    throw new DatabaseError("Failed to fetch machines data", error);
  }
}

// ==========================================
// RESPONSE FORMATTER
// ==========================================

function formatResponse(sensorData, predictionData) {
  const machineId = predictionData.machineId || sensorData?.machineId;
  const isMaintenance =
    predictionData.prediction === "Maintenance" ||
    predictionData.rawPayload?.predictedFailureType === "Maintenance";
  const hasForecastFailure =
    predictionData.forecast &&
    predictionData.forecast !== "No Failure" &&
    predictionData.forecast !== null;

  // Build sensorData dengan classification
  // Untuk maintenance, nilai sensor tetap 0 seperti di ML API
  const sensorDataFormatted = {
    type: sensorData?.machineType || "unknown",
    airTemperature: isMaintenance
      ? 0.0
      : sensorData && sensorData.airTemperature != null
      ? Number(sensorData.airTemperature.toFixed(2))
      : null,
    processTemperature: isMaintenance
      ? 0.0
      : sensorData && sensorData.processTemperature != null
      ? Number(sensorData.processTemperature.toFixed(2))
      : null,
    rotationalSpeed: isMaintenance
      ? 0
      : (sensorData && sensorData.rotationalSpeed) || null,
    torque: isMaintenance
      ? 0.0
      : sensorData && sensorData.torque != null
      ? Number(sensorData.torque.toFixed(2))
      : null,
    toolWear: isMaintenance ? 0 : (sensorData && sensorData.toolWear) || null,
    timestamp:
      (sensorData && sensorData.timestamp
        ? new Date(sensorData.timestamp).toISOString()
        : null) || null,
    classification:
      predictionData.rawPayload?.predictedFailureType ||
      predictionData.prediction ||
      "No Failure",
  };

  // Varian 1: Maintenance - hanya sensorData + classification
  if (isMaintenance) {
    return {
      machineId,
      sensorData: sensorDataFormatted,
    };
  }

  // Varian 2: Normal tanpa Forecast - sensorData + classification
  if (!hasForecastFailure) {
    return {
      machineId,
      sensorData: sensorDataFormatted,
    };
  }

  // Varian 3: Normal dengan Forecast - sensorData + predicted + ticket
  const predicted = {
    forecast: predictionData.forecast,
    recommendation: predictionData.recommendation,
    predictedAt: predictionData.predictedAt
      ? new Date(predictionData.predictedAt).toISOString()
      : null,
    timestamp: predictionData.rawPayload?.forecastFailureTimestampRaw || null,
    countdown: predictionData.rawPayload?.forecastFailureCountdownRaw || null,
  };

  return {
    machineId,
    sensorData: sensorDataFormatted,
    predicted,
    // Ticket will be attached by caller (either ticket object or null)
    ticket: null,
  };
}

/**
 * Get single machine with latest sensor data & prediction
 */
async function getMachineById(machineId) {
  try {
    const machine = await prisma.machine.findUnique({
      where: { id: machineId },
      include: {
        predictions: {
          orderBy: { predictedAt: "desc" },
          take: 1, // Latest prediction
        },
        tickets: {
          // Urutkan berdasarkan countdown terendah (expectedFailureAt terdekat)
          orderBy: [
            { expectedFailureAt: "asc" }, // Countdown terendah dulu
            { createdAt: "desc" }, // Fallback ke created terbaru
          ],
          take: 5, // Latest 5 tickets
        },
      },
    });

    if (!machine) {
      throw new NotFoundError(`Machine ${machineId} not found`);
    }

    const latestPrediction = machine.predictions?.[0];

    // Jika tidak ada prediction dan tidak ada snapshot, return dengan data minimal
    if (!latestPrediction && !machine.sensorTimestamp) {
      return {
        machineId: machine.id,
        sensorData: {
          type: machine.type,
          airTemperature: null,
          processTemperature: null,
          rotationalSpeed: null,
          torque: null,
          toolWear: null,
          timestamp: null,
          classification: "Unknown",
        },
      };
    }

    // Determine machine variant
    const isMaintenance =
      latestPrediction?.prediction === "Maintenance" ||
      latestPrediction?.rawPayload?.predictedFailureType === "Maintenance";
    const hasForecastFailure =
      latestPrediction &&
      latestPrediction.forecast &&
      latestPrediction.forecast !== "No Failure" &&
      latestPrediction.forecast !== null;

    // Build sensorData dengan classification
    // Untuk maintenance, nilai sensor tetap 0 seperti di ML API
    const sensorDataFormatted = {
      type: machine.type,
      airTemperature: isMaintenance
        ? 0.0
        : machine.airTemperature != null
        ? Number(Number(machine.airTemperature).toFixed(2))
        : null,
      processTemperature: isMaintenance
        ? 0.0
        : machine.processTemperature != null
        ? Number(Number(machine.processTemperature).toFixed(2))
        : null,
      rotationalSpeed: isMaintenance ? 0 : machine.rotationalSpeed ?? null,
      torque: isMaintenance
        ? 0.0
        : machine.torque != null
        ? Number(Number(machine.torque).toFixed(2))
        : null,
      toolWear: isMaintenance ? 0 : machine.toolWear ?? null,
      timestamp: machine.sensorTimestamp
        ? new Date(machine.sensorTimestamp).toISOString()
        : null,
      classification:
        latestPrediction?.rawPayload?.predictedFailureType ||
        latestPrediction?.prediction ||
        "No Failure",
    };

    // Varian 1: Maintenance - hanya sensorData + classification
    if (isMaintenance) {
      return {
        machineId: machine.id,
        sensorData: sensorDataFormatted,
      };
    }

    // Varian 2: Normal tanpa Forecast - sensorData + classification
    if (!hasForecastFailure) {
      return {
        machineId: machine.id,
        sensorData: sensorDataFormatted,
      };
    }

    // Varian 3: Normal dengan Forecast - sensorData + predicted + ticket
    const predicted = {
      forecast: latestPrediction.forecast,
      recommendation: latestPrediction.recommendation,
      predictedAt: latestPrediction.predictedAt
        ? new Date(latestPrediction.predictedAt).toISOString()
        : null,
      timestamp: latestPrediction.forecastFailureTimestamp
        ? new Date(latestPrediction.forecastFailureTimestamp).toISOString()
        : latestPrediction.rawPayload?.forecastFailureTimestampRaw || null,
      countdown:
        latestPrediction.rawPayload?.forecastFailureCountdownRaw || null,
    };

    return {
      machineId: machine.id,
      sensorData: sensorDataFormatted,
      predicted,
      ticket: machine.tickets?.[0] || null, // Ticket terbaru dengan countdown terendah
    };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new DatabaseError(`Failed to fetch machine ${machineId}`, error);
  }
}

/**
 * Trigger ML API for ALL machines using full-request endpoint.
 * Calls ML API /full-request endpoint and processes all returned machines.
 */
async function predictAllMachines(machineIds = null) {
  try {
    console.log(`[ML] Calling full-request endpoint for all machines`);
    const startTime = Date.now();

    // Call ML API full-request endpoint
    const mlResponse = await callMlApiFullRequest();
    const duration = Date.now() - startTime;
    console.log(`[ML] Full-request API latency: ${duration}ms`);

    // Normalize response: handle both array and object with array
    let machinesData = [];
    if (Array.isArray(mlResponse)) {
      machinesData = mlResponse;
    } else if (mlResponse && Array.isArray(mlResponse.data)) {
      machinesData = mlResponse.data;
    } else if (mlResponse && Array.isArray(mlResponse.machines)) {
      machinesData = mlResponse.machines;
    } else if (mlResponse && typeof mlResponse === "object") {
      // Try to find any array property
      const arrayKeys = Object.keys(mlResponse).filter((key) =>
        Array.isArray(mlResponse[key])
      );
      if (arrayKeys.length > 0) {
        machinesData = mlResponse[arrayKeys[0]];
      } else {
        // Single object response, wrap in array
        machinesData = [mlResponse];
      }
    } else {
      throw new ValidationError(
        "Invalid ML API response format: expected array or object with array"
      );
    }

    if (!Array.isArray(machinesData) || machinesData.length === 0) {
      throw new ValidationError("ML API returned empty data");
    }

    console.log(
      `[ML] Processing ${machinesData.length} machines from full-request`
    );

    // Process setiap machine secara terkontrol untuk menghindari limit pool DB
    // Tambahkan delay kecil antara operasi untuk mengurangi beban connection pool
    const processedResults = [];
    const DELAY_MS = 50; // Delay 50ms antara setiap operasi database

    for (let index = 0; index < machinesData.length; index++) {
      const machineData = machinesData[index];

      // Tambahkan delay kecil sebelum operasi database (kecuali untuk item pertama)
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }

      try {
        // Log first machine data structure untuk debugging
        if (index === 0) {
          console.log(
            `[ML] Sample machine data structure:`,
            JSON.stringify(machineData, null, 2)
          );
        }

        // Parse ML response untuk setiap machine
        const { sensorData, prediction } = parseMLResponse(machineData);
        const machineId = sensorData.machineId;

        // Save to database (transaction) - will auto-create ticket if threshold met
        const createdTicket = await savePredictionData(sensorData, prediction);

        // Format response
        const formatted = formatResponse(sensorData, prediction);
        formatted.ticket = createdTicket || null;

        // Cache in Redis (non-blocking, tidak perlu delay)
        await setPredictionToRedis(machineId, formatted).catch((err) =>
          console.warn(`Failed to cache ${machineId} in Redis:`, err.message)
        );

        processedResults.push({ machineId, success: true, data: formatted });
      } catch (error) {
        // Extract machineId if possible for error reporting
        let machineId = "unknown";
        try {
          if (machineData && machineData["Machine ID"]) {
            machineId = machineData["Machine ID"];
          } else if (machineData && machineData.machineId) {
            machineId = machineData.machineId;
          } else if (machineData && machineData.id) {
            machineId = machineData.id;
          }
        } catch (e) {
          // Ignore
        }

        // Log detailed error untuk debugging
        console.error(
          `[ML] Failed to process machine ${machineId}:`,
          error.message
        );

        // Log validation errors dengan detail
        if (error.name === "ZodError" || error.details) {
          console.error(
            `[ML] Validation errors for ${machineId}:`,
            error.errors || error.details || error
          );
          // Log sample of problematic data
          console.error(
            `[ML] Problematic data for ${machineId}:`,
            JSON.stringify(machineData, null, 2).substring(0, 500)
          );
        }

        processedResults.push({
          machineId,
          success: false,
          error: error.message || String(error),
          details:
            error.originalError ||
            error.errors ||
            error.details ||
            error.meta ||
            null,
        });
      }
    }

    console.log(
      `[ML] Processed ${processedResults.length} machines: ${
        processedResults.filter((r) => r.success).length
      } success, ${processedResults.filter((r) => !r.success).length} failed`
    );

    return processedResults;
  } catch (error) {
    console.error("[ML] Full-request failed:", error);
    throw error;
  }
}

module.exports = {
  predictAnomaly,
  predictAllMachines,
  getMachineById,
  getAllMachinesFullData,
  formatResponse,
};
