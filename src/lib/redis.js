// src/lib/redis.js
const Redis = require("ioredis");
const config = require("../config");

// Inisialisasi koneksi Redis
const redis = new Redis({
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword, // Gunakan jika ada password
  maxRetriesPerRequest: 2, // Batasi percobaan ulang
});

redis.on("error", (err) => {
  console.error("❌ Redis Error:", err.message);
});

redis.on("connect", () => {
  console.log("✅ Redis connected successfully.");
});

// Tutup koneksi saat aplikasi dimatikan (Graceful Shutdown)
process.on("SIGINT", () => {
  redis.quit();
});

module.exports = redis;
