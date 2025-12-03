// src/controllers/ticketController.js
const prisma = require("../lib/prisma"); // Pastikan path ini benar

/**
 * GET /tickets
 * Mengambil semua tiket maintenance (bisa difilter status via query param)
 * Contoh: /tickets?status=open
 */
async function getTickets(req, res, next) {
  try {
    const { status, machineId } = req.query;

    const whereClause = {};
    if (status) whereClause.status = status;       // Filter by Status
    if (machineId) whereClause.machineId = machineId; // Filter by Mesin

    const tickets = await prisma.maintenanceTicket.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }, // Tiket terbaru paling atas
      include: {
        machine: { select: { type: true } } // Sertakan info tipe mesin
      }
    });

    res.json({ count: tickets.length, data: tickets });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTickets };