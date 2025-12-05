// src/services/schedulerService.js
/**
 * Scheduler Service
 * Auto-update data machine dari ML API setiap interval tertentu
 */

const { predictAllMachines } = require("./sensorService");

// Flag untuk mencegah multiple jobs berjalan bersamaan
let isRunning = false;
let schedulerInterval = null;
let lastRunTime = null;
let lastRunStatus = null;
let ioInstance = null; // Socket.IO instance untuk real-time updates

/**
 * Execute scheduled update dari ML API
 */
async function executeScheduledUpdate() {
  // Prevent concurrent execution
  if (isRunning) {
    console.log(
      `[SCHEDULER] ⏸️  Previous update masih berjalan, skip execution ini`
    );
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  lastRunTime = new Date();

  try {
    console.log(
      `[SCHEDULER] 🚀 Starting scheduled update at ${lastRunTime.toISOString()}`
    );

    // Call predictAllMachines untuk update semua data
    const results = await predictAllMachines();

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    lastRunStatus = {
      success: true,
      total: results.length,
      successCount,
      failCount,
      duration,
      timestamp: lastRunTime.toISOString(),
    };

    console.log(
      `[SCHEDULER] ✅ Scheduled update completed in ${duration}ms`
    );
    console.log(
      `[SCHEDULER] 📊 Results: ${successCount} success, ${failCount} failed out of ${results.length} machines`
    );

    // Emit WebSocket event untuk notify frontend bahwa data sudah di-update
    if (ioInstance) {
      ioInstance.emit("machines:updated", {
        timestamp: lastRunTime.toISOString(),
        total: results.length,
        successCount,
        failCount,
        duration,
      });
      console.log(`[SCHEDULER] 📡 WebSocket notification sent to clients`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    lastRunStatus = {
      success: false,
      error: error.message,
      duration,
      timestamp: lastRunTime.toISOString(),
    };

    console.error(`[SCHEDULER] ❌ Scheduled update failed:`, error.message);
    console.error(`[SCHEDULER] Error details:`, error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start scheduler dengan interval tertentu (dalam milliseconds)
 * @param {number} intervalMs - Interval dalam milliseconds (default: 1 jam = 3600000ms)
 */
function startScheduler(intervalMs = 3600000) {
  // Stop existing scheduler jika ada
  if (schedulerInterval) {
    stopScheduler();
  }

  console.log(
    `[SCHEDULER] ⏰ Starting scheduler with interval: ${intervalMs}ms (${intervalMs / 1000 / 60} minutes)`
  );

  // Execute immediately on start (optional - bisa di-comment jika tidak ingin)
  // executeScheduledUpdate();

  // Schedule periodic execution
  schedulerInterval = setInterval(() => {
    executeScheduledUpdate();
  }, intervalMs);

  console.log(`[SCHEDULER] ✅ Scheduler started successfully`);
}

/**
 * Stop scheduler
 */
function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log(`[SCHEDULER] 🛑 Scheduler stopped`);
  }
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  return {
    isRunning: isRunning,
    isActive: schedulerInterval !== null,
    lastRunTime: lastRunTime ? lastRunTime.toISOString() : null,
    lastRunStatus: lastRunStatus,
  };
}

/**
 * Manually trigger update (untuk testing atau manual trigger)
 */
async function triggerManualUpdate() {
  if (isRunning) {
    throw new Error("Update masih berjalan, tunggu hingga selesai");
  }

  return executeScheduledUpdate();
}

/**
 * Set Socket.IO instance untuk real-time updates
 * @param {Object} io - Socket.IO server instance
 */
function setSocketIO(io) {
  ioInstance = io;
  console.log(`[SCHEDULER] 📡 Socket.IO instance registered for real-time updates`);
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerManualUpdate,
  executeScheduledUpdate,
  setSocketIO,
};

