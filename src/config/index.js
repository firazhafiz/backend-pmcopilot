require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5000,
  mlApiUrl: process.env.ML_API_URL,
  googleApiKey: process.env.GOOGLE_API_KEY,
  directDatabaseUrl: process.env.DIRECT_URL,
  redisHost: process.env.REDIS_HOST || "localhost",
  redisPort: process.env.REDIS_PORT || 6379,
  // Scheduler configuration
  // UPDATE_INTERVAL_MS: interval untuk auto-update data machine dari ML API (dalam milliseconds)
  // Default: 1 jam (3600000ms)
  // Contoh: 30 menit = 1800000, 2 jam = 7200000
  updateIntervalMs: parseInt(process.env.UPDATE_INTERVAL_MS) || 3600000, // 1 jam default
  // AUTO_START_SCHEDULER: apakah scheduler harus start otomatis saat server start
  // Default: true
  autoStartScheduler: process.env.AUTO_START_SCHEDULER !== "false",
};
