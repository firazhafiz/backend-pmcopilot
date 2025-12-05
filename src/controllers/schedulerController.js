// src/controllers/schedulerController.js
/**
 * Scheduler Controller
 * Handle scheduler endpoints untuk manage auto-update data machine
 */

const schedulerService = require("../services/schedulerService");
const config = require("../config");

/**
 * GET /scheduler/status
 * Get scheduler status
 */
async function getStatus(req, res, next) {
  try {
    const status = schedulerService.getSchedulerStatus();

    res.status(200).json({
      success: true,
      data: {
        ...status,
        config: {
          updateIntervalMs: config.updateIntervalMs,
          updateIntervalMinutes: config.updateIntervalMs / 1000 / 60,
          autoStart: config.autoStartScheduler,
        },
      },
      message: "Scheduler status retrieved successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /scheduler/trigger
 * Manually trigger scheduled update
 */
async function triggerManual(req, res, next) {
  try {
    console.log(`[SCHEDULER] Manual trigger requested`);

    await schedulerService.triggerManualUpdate();

    res.status(200).json({
      success: true,
      message: "Manual update triggered successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /scheduler/start
 * Start scheduler
 */
async function start(req, res, next) {
  try {
    const { intervalMs } = req.body;
    const interval = intervalMs || config.updateIntervalMs;

    console.log(`[SCHEDULER] Start requested with interval: ${interval}ms`);

    schedulerService.startScheduler(interval);

    res.status(200).json({
      success: true,
      message: `Scheduler started with interval: ${interval}ms (${interval / 1000 / 60} minutes)`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /scheduler/stop
 * Stop scheduler
 */
async function stop(req, res, next) {
  try {
    console.log(`[SCHEDULER] Stop requested`);

    schedulerService.stopScheduler();

    res.status(200).json({
      success: true,
      message: "Scheduler stopped successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStatus,
  triggerManual,
  start,
  stop,
};

