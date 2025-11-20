// src/services/mlApiService.js
const axios = require("axios");
const config = require("../config");

async function callMlApi(machineId) {
  if (!config.mlApiUrl) {
    throw new Error("ML_API_URL belum diset di .env");
  }

  try {
    const response = await axios.post(
      config.mlApiUrl,
      { MachineID: machineId },
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      const err = new Error("Machine ID tidak ditemukan");
      err.code = "MACHINE_NOT_FOUND";
      throw err;
    }
    throw new Error(
      "Gagal menghubungi ML API: " + (error.message || "Unknown error")
    );
  }
}

module.exports = { callMlApi };
