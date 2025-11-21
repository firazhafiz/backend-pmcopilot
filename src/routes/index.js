// src/routes/index.js
const express = require("express");
const router = express.Router();

const sensorController = require("../controllers/sensorController");
const agentController = require("../controllers/agentController");

// ==========================================
// 1. MACHINES ENDPOINTS (Sesuai Request)
// ==========================================

// POST /machines 
// Fungsi: Trigger ML API untuk 1 mesin spesifik & simpan data (Sync)
router.post("/machines", sensorController.postMachine); 

// GET /machines
// Fungsi: Ambil SEMUA data (Machine + Sensor + Predictions) untuk Dashboard
router.get("/machines", sensorController.getMachines);


// ==========================================
// 2. AGENT CHATBOT (Tetap)
// ==========================================
router.post("/agent/chat", agentController.chatWithAgent);
router.post("/agent/chat/:sessionId", agentController.chatWithAgent);
router.get("/agent/chat/:sessionId", agentController.getSessionHistory);

module.exports = router;