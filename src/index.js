const express = require("express");
const cors = require("cors");
const prisma = require("./lib/prisma");
const redis = require("./lib/redis");
const config = require("./config");
const routes = require("./routes");
const { errorHandler, notFoundHandler } = require("./utils/errorHandler");
const { logger } = require("./middleware");

const app = express();

// ==========================================
// MIDDLEWARE
// ==========================================

// CORS
app.use(cors({ origin: "http://localhost:3000" }));

// Body Parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Logger
app.use(logger);

// ==========================================
// ROUTES
// ==========================================

app.use("/api", routes);

// ==========================================
// ERROR HANDLERS
// ==========================================

// 404 Not Found Handler
app.use(notFoundHandler);

// Global Error Handler (HARUS PALING AKHIR)
app.use(errorHandler);

// ==========================================
// SERVER STARTUP
// ==========================================

async function main() {
  try {
    // Connect to database
    await prisma.$connect();
    console.log("✅ Database connected successfully.");

    // Redis sudah auto-connect saat require di index.js

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
    });

    // ==========================================
    // GRACEFUL SHUTDOWN
    // ==========================================

    process.on("SIGTERM", () => {
      console.log("👋 SIGTERM signal received: Closing HTTP server.");
      server.close(async () => {
        await prisma.$disconnect();
        await redis.quit();
        console.log("✅ Database connection closed.");
        console.log("✅ Redis connection closed.");
        console.log("✅ HTTP server closed.");
        process.exit(0);
      });
    });

    process.on("SIGINT", () => {
      console.log("👋 SIGINT signal received: Closing HTTP server.");
      server.close(async () => {
        await prisma.$disconnect();
        await redis.quit();
        console.log("✅ All connections closed.");
        process.exit(0);
      });
    });

    // Unhandled rejection
    process.on("unhandledRejection", (reason, promise) => {
      console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    });

    // Uncaught exception
    process.on("uncaughtException", (error) => {
      console.error("❌ Uncaught Exception:", error);
      process.exit(1);
    });
  } catch (err) {
    console.error("❌ Failed to start server:");
    console.error(err);
    process.exit(1);
  }
}

main();
