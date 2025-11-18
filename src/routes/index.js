// src/routes/index.js ← PASTIKAN HANYA ADA FILE INI SATU
const express = require("express");
const sensorController = require("../controllers/sensorController");
const agentController = require("../controllers/agentController");

const router = express.Router();

// HANYA YANG PASTI ADA FUNGSINYA
router.get("/sensors/:machineId", sensorController.getSensorData);
router.post("/predict", sensorController.predictAnomaly);
router.post("/sensors", sensorController.addSensor);
router.post("/agent/chat", agentController.chatWithAgent);

// YANG LAIN DI-COMMENT DULU
// router.post("/tickets", sensorController.createTicket);
// router.post("/agent/query", agentController.handleQuery);

module.exports = router;
