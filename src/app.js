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
// Serve swagger.yaml for CDN Swagger UI
app.get("/swagger.yaml", (req, res) => {
  res.sendFile(path.join(__dirname, "swagger.yaml"));
});

// Swagger UI via CDN
app.get("/docs", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Swagger UI</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-standalone-preset.js"></script>
        <script>
          window.onload = function() {
            SwaggerUIBundle({
              url: '/swagger.yaml',
              dom_id: '#swagger-ui',
              presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIStandalonePreset
              ],
              layout: "StandaloneLayout"
            });
          };
        </script>
      </body>
    </html>
  `);
});

// 404 & Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
