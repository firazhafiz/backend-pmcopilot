const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const { errorHandler, notFoundHandler } = require("./utils/errorHandler");
const { logger } = require("./middleware");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

const app = express();

// CORS
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));

// Body Parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Logger
app.use(logger);

// Routes
app.use("/api", routes);
app.use("/", routes);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "PMCopilot API running",
    docs: "/api/docs",
    base: "/api",
  });
});

app.get("/api", (req, res) => {
  res.status(200).json({ success: true, message: "PMCopilot API base" });
});

// Swagger Docs
const swaggerDocument = YAML.load(path.join(__dirname, "swagger.yaml"));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 404 & Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
