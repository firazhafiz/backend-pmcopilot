// src/routes/index.js ← PASTIKAN HANYA ADA FILE INI SATU
const express = require("express");
const sensorController = require("../controllers/sensorController");

const router = express.Router();

// HANYA YANG PASTI ADA FUNGSINYA
router.get("/sensors/:machineId", sensorController.getSensorData);
router.post("/predict", sensorController.predictAnomaly);
router.post("/sensors", sensorController.addSensor);

// YANG LAIN DI-COMMENT DULU
// router.post("/tickets", sensorController.createTicket);
// router.post("/agent/query", agentController.handleQuery);

module.exports = router;
