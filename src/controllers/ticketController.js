// src/controllers/ticketController.js
/**
 * Ticket Controller
 * Handle maintenance ticket endpoints
 */

const ticketService = require("../services/ticketService");
const { ValidationError, NotFoundError } = require("../utils/customError");

/**
 * GET /tickets
 * Get all maintenance tickets with optional filtering
 */
async function getAllTickets(req, res, next) {
  try {
    const {
      limit = "50",
      offset = "0",
      machineId,
      status,
      priority,
    } = req.validated.query;

    console.log(
      `[TICKET] Fetching tickets: limit=${limit}, offset=${offset}, machineId=${
        machineId || "all"
      }`
    );

    const result = await ticketService.getAllTickets({
      limit,
      offset,
      machineId,
      status,
      priority,
    });

    res.status(200).json({
      success: true,
      data: result.tickets,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
      message: "Tickets retrieved successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /tickets/:ticketId
 * Get ticket by ID
 */
async function getTicketById(req, res, next) {
  try {
    const { ticketId } = req.validated.params;

    console.log(`[TICKET] Fetching ticket #${ticketId}`);

    const ticket = await ticketService.getTicketById(parseInt(ticketId));

    res.status(200).json({
      success: true,
      data: ticket,
      message: "Ticket retrieved successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /tickets/:ticketId/status
 * Update ticket status
 */
async function updateTicketStatus(req, res, next) {
  try {
    const { ticketId } = req.validated.params;
    const { status } = req.validated.body;

    console.log(
      `[TICKET] Updating ticket #${ticketId} status to ${
        status ? "opened" : "closed"
      }`
    );

    const ticket = await ticketService.updateTicketStatus(
      parseInt(ticketId),
      status
    );

    res.status(200).json({
      success: true,
      data: ticket,
      message: "Ticket status updated successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllTickets,
  getTicketById,
  updateTicketStatus,
};
