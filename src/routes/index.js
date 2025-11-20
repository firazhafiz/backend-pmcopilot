// src/routes/index.js — GAK USAH DIUBAH LAGI!
const express = require("express");
const sensorController = require("../controllers/sensorController");
const agentController = require("../controllers/agentController");

const router = express.Router();

router.get("/sensors/:machineId", sensorController.getSensorData);
router.post("/predict", sensorController.predictAnomaly); // LANGSUNG JALAN!
router.post("/sensors", sensorController.addSensor);
router.post("/agent/chat", agentController.chatWithAgent);

module.exports = router;
