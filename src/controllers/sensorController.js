// src/controllers/sensorController.js
const sensorService = require("../services/sensorService");

/**
 * POST /machines
 * Request ke ML API untuk mesin tertentu, simpan ke DB, kembalikan snapshot terbaru.
 */
async function postMachine(req, res, next) {
  try {
    const { machineId } = req.body;
    if (!machineId) return res.status(400).json({ error: "Machine ID is required" });

    // Memanggil logic sync yg sudah ada
    const result = await sensorService.predictAnomaly(machineId);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /machines
 * Mengambil seluruh list mesin beserta data sensor dan history prediksinya.
 */
async function getMachines(req, res, next) {
  try {
    // Panggil service baru untuk ambil semua data
    const machines = await sensorService.getAllMachinesFullData();
    
    res.json({
      message: "Data fetched successfully",
      totalMachines: machines.length,
      data: machines
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  postMachine,
  getMachines
};