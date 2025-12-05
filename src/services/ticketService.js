// src/services/ticketService.js
/**
 * Ticket Service
 * Business logic untuk maintenance tickets
 */

const prisma = require("../lib/prisma");
const { DatabaseError, NotFoundError } = require("../utils/customError");

/**
 * Get all maintenance tickets dengan optional filtering
 * @param {Object} options - { limit, offset, machineId, status, priority }
 * @returns {Object} { tickets, total, limit, offset }
 */
async function getAllTickets(options = {}) {
  try {
    const { limit = 50, offset = 0, machineId, status, priority } = options;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 500);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    // Build where filter
    const where = {};
    if (machineId) where.machineId = machineId;
    if (typeof status === "boolean") where.status = status;
    if (priority) where.priority = priority;

    // Sequential execution untuk menghindari terlalu banyak koneksi bersamaan
    // Count query lebih ringan, jadi bisa dijalankan terlebih dahulu
    const total = await prisma.maintenanceTicket.count({ where });
    const tickets = await prisma.maintenanceTicket.findMany({
      where,
      skip: parsedOffset,
      take: parsedLimit,
      // Urutkan dari countdown (expectedFailureAt) yang paling rendah dulu,
      // lalu fallback ke createdAt terbaru.
      orderBy: [{ expectedFailureAt: "asc" }, { createdAt: "desc" }],
    });

    console.log(`[TICKET] Fetched ${tickets.length} tickets (total: ${total})`);

    return {
      tickets,
      total,
      limit: parsedLimit,
      offset: parsedOffset,
    };
  } catch (error) {
    throw new DatabaseError("Failed to fetch tickets", error);
  }
}

/**
 * Get ticket by ID
 * @param {number} ticketId - Ticket ID
 * @returns {Object} Ticket record with machine details
 */
async function getTicketById(ticketId) {
  try {
    const ticket = await prisma.maintenanceTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundError("Ticket");
    }

    console.log(`[TICKET] Fetched ticket #${ticketId}`);
    return ticket;
  } catch (error) {
    if (error.code === "P2025") {
      throw new NotFoundError("Ticket");
    }
    throw new DatabaseError("Failed to fetch ticket", error);
  }
}

/**
 * Update ticket status
 * @param {number} ticketId - Ticket ID
 * @param {boolean} status - New status (true=opened, false=closed)
 * @returns {Object} Updated ticket
 */
async function updateTicketStatus(ticketId, status) {
  try {
    if (typeof status !== "boolean") {
      throw new Error(
        "Invalid status. Must be boolean: true=opened, false=closed"
      );
    }

    const ticket = await prisma.maintenanceTicket.update({
      where: { id: ticketId },
      data: {
        status,
        ...(status === false && { closedAt: new Date() }),
      },
    });

    console.log(
      `[TICKET] Updated ticket #${ticketId} status to ${
        status ? "opened" : "closed"
      }`
    );
    return ticket;
  } catch (error) {
    if (error.code === "P2025") {
      throw new NotFoundError("Ticket");
    }
    throw new DatabaseError("Failed to update ticket status", error);
  }
}

module.exports = {
  getAllTickets,
  getTicketById,
  updateTicketStatus,
};
