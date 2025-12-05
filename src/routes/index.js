// src/routes/index.js
const express = require("express");
const router = express.Router();

const sensorController = require("../controllers/sensorController");
const agentController = require("../controllers/agentController");
const ticketController = require("../controllers/ticketController");
const schedulerController = require("../controllers/schedulerController");
const { validateRequest } = require("../middleware");
const {
  postMachineSchema,
  postMachineByIdSchema,
  getMachineByIdSchema,
  getMachinesSchema,
  postPredictSchema,
  chatWithAgentSchema,
  chatSessionIdSchema,
  getTicketsSchema,
  getTicketByIdSchema,
  updateTicketStatusSchema,
} = require("../validators/schemas");

// ==========================================
// 1. MACHINES ENDPOINTS
// ==========================================

/**
 * GET /machines
 * Ambil SEMUA data (Machine + Sensor + Predictions) untuk Dashboard
 */
router.get(
  "/machines",
  validateRequest(getMachinesSchema),
  sensorController.getMachines
);

/**
 * GET /machines/:machineId
 * Ambil data 1 mesin spesifik dengan latest sensor data & predictions
 */
router.get(
  "/machines/:machineId",
  validateRequest(getMachineByIdSchema),
  sensorController.getMachineById
);

/**
 * POST /machines
 * Trigger ML API full-request endpoint untuk mendapatkan semua machines dari ML API
 * No body required - akan mengambil semua data dari ML API endpoint /full-request
 */
router.post(
  "/machines",
  validateRequest(postPredictSchema),
  sensorController.postPredictAll
);

/**
 * POST /machines/:machineId
 * Trigger ML API per-machine endpoint untuk 1 mesin spesifik & simpan data
 * Endpoint ML API: /predictive-maintenance/{machine_id}
 */
router.post(
  "/machines/:machineId",
  validateRequest(postMachineByIdSchema),
  sensorController.postPredict
);

// ==========================================
// 2. AGENT CHATBOT ENDPOINTS
// ==========================================

/**
 * POST /agent/chat
 * Start new chat session atau continue existing
 */
router.post(
  "/agent/chat",
  validateRequest(chatWithAgentSchema),
  agentController.chatWithAgent
);

/**
 * POST /agent/chat/:sessionId
 * Continue existing chat session
 */
router.post(
  "/agent/chat/:sessionId",
  validateRequest(chatWithAgentSchema),
  validateRequest(chatSessionIdSchema),
  agentController.chatWithAgent
);

/**
 * GET /agent/chat/:sessionId
 * Get chat history untuk session tertentu
 */
router.get(
  "/agent/chat/:sessionId",
  validateRequest(chatSessionIdSchema),
  agentController.getSessionHistory
);

// ==========================================
// 3. TICKETS ENDPOINTS
// ==========================================

/**
 * GET /tickets
 * Get all maintenance tickets dengan optional filtering
 */
router.get(
  "/tickets",
  validateRequest(getTicketsSchema),
  ticketController.getAllTickets
);

/**
 * GET /tickets/:ticketId
 * Get ticket by ID
 */
router.get(
  "/tickets/:ticketId",
  validateRequest(getTicketByIdSchema),
  ticketController.getTicketById
);

/**
 * PATCH /tickets/:ticketId/status
 * Update ticket status
 */
router.patch(
  "/tickets/:ticketId/status",
  validateRequest(updateTicketStatusSchema),
  ticketController.updateTicketStatus
);

// ==========================================
// 4. SCHEDULER ENDPOINTS
// ==========================================

/**
 * GET /scheduler/status
 * Get scheduler status (last run time, status, etc)
 */
router.get("/scheduler/status", schedulerController.getStatus);

/**
 * POST /scheduler/trigger
 * Manually trigger scheduled update
 */
router.post("/scheduler/trigger", schedulerController.triggerManual);

/**
 * POST /scheduler/start
 * Start scheduler (if stopped)
 */
router.post("/scheduler/start", schedulerController.start);

/**
 * POST /scheduler/stop
 * Stop scheduler
 */
router.post("/scheduler/stop", schedulerController.stop);

module.exports = router;
