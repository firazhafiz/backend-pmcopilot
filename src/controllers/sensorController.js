// src/controllers/sensorController.js
/**
 * Sensor Controller
 * Handle sensor data dan ML prediction requests
 */

const sensorService = require("../services/sensorService");
const { ValidationError, NotFoundError } = require("../utils/customError");

/**
 * POST /machines/:machineId/predict
 * Trigger ML prediction untuk machine tertentu, simpan sensor data & prediction
 */
async function postPredict(req, res, next) {
  try {
    const { machineId } = req.validated.params;

    console.log(`[SENSOR] Calling predictAnomaly for machine: ${machineId}`);

    const result = await sensorService.predictAnomaly(machineId);

    res.status(200).json({
      success: true,
      data: result,
      message: "Prediction completed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /machines (batch)
 * Trigger ML prediction for ALL machines from ML API full-request endpoint.
 * Returns array of results per machine.
 */
async function postPredictAll(req, res, next) {
  try {
    console.log(`[SENSOR] Calling full-request ML API for all machines`);

    // Call ML API full-request endpoint (no machineIds needed)
    const results = await sensorService.predictAllMachines();

    res.status(200).json({
      success: true,
      data: results,
      message: "Batch predictions completed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /machines/:machineId
 * Fetch single machine dengan latest sensor data & prediction
 */
async function getMachineById(req, res, next) {
  try {
    const { machineId } = req.validated.params;

    console.log(`[SENSOR] Fetching machine data for: ${machineId}`);

    const result = await sensorService.getMachineById(machineId);

    res.status(200).json({
      success: true,
      data: result,
      message: "Machine data fetched successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /machines/:machineId
 * @deprecated Use POST /machines/:machineId/predict instead
 * Trigger ML prediction untuk machine tertentu, simpan sensor data & prediction
 */
async function postMachine(req, res, next) {
  try {
    const { machineId } = req.validated.params;

    console.log(`[SENSOR] Calling predictAnomaly for machine: ${machineId}`);

    // Call service dengan machineId yang sudah tervalidasi
    const result = await sensorService.predictAnomaly(machineId);

    // Success response
    res.status(200).json({
      success: true,
      data: result,
      message: "Prediction completed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /machines (no body)
 * @deprecated Use POST /machines/predict instead
 * Trigger ML prediction for ALL known machines. Returns array of results per machine.
 */
async function postMachinesAll(req, res, next) {
  try {
    console.log(`[SENSOR] Calling predictAnomaly for ALL machines`);

    const results = await sensorService.predictAllMachines();

    res.status(200).json({
      success: true,
      data: results,
      message: "Batch predictions completed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /machines
 * Ambil list semua machine dengan latest sensor data & predictions
 * Optional query params: limit, offset, riskLevel
 */
async function getMachines(req, res, next) {
  try {
    const { limit = "50", offset = "0" } = req.validated.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 500); // Max 500
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    console.log(
      `[SENSOR] Fetching machines: limit=${parsedLimit}, offset=${parsedOffset}`
    );

    // Call service
    const result = await sensorService.getAllMachinesFullData(
      parsedLimit,
      parsedOffset
    );

    // Success response
    res.status(200).json({
      success: true,
      data: {
        machines: result.data,
        total: result.total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
      message: "Machines data fetched successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  postPredict,
  postPredictAll,
  getMachineById,
  getMachines,
  // Deprecated exports (kept for backward compatibility)
  postMachine,
  postMachinesAll,
};
