const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const config = require("./config");
const routes = require("./routes");
const errorHandler = require("./utils/errorHandler");

const prisma = new PrismaClient();
const app = express();

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

app.use("/api", routes);

app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
});

app.use(errorHandler);

async function main() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully.");

    const server = app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
    });

    process.on("SIGTERM", () => {
      console.log("👋 SIGTERM signal received: Closing HTTP server.");
      server.close(async () => {
        await prisma.$disconnect();
        console.log("Database connection closed.");
        console.log("HTTP server closed.");
        process.exit(0);
      });
    });
  } catch (err) {
    console.error("❌ Failed to start server or connect to database:");
    console.error(err);
    process.exit(1);
  }
}

main();
