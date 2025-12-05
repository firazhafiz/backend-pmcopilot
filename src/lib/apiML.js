// src/lib/apiML.js
const axios = require("axios");
const config = require("../config");
const { ExternalServiceError } = require("../utils/customError");

/**
 * Call ML API untuk single machine
 * Endpoint: {ML_API_URL}/predictive-maintenance/{machine_id}
 */
async function callMlApi(machineId) {
  if (!config.mlApiUrl) {
    throw new Error("ML_API_URL belum diset di .env");
  }

  try {
    // Remove trailing slash jika ada, lalu append path
    const baseUrl = config.mlApiUrl.replace(/\/$/, "");
    const url = `${baseUrl}/predictive-maintenance/${machineId}`;
    console.log(`[ML API] Calling per-machine endpoint: ${url}`);

    const response = await axios.post(
      url,
      {},
      {
        headers: {
          "ngrok-skip-browser-warning": "true", // Skip ngrok browser warning
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    // Log detailed error untuk debugging
    console.error(`[ML API] Per-machine error for ${machineId}:`, {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
    });

    if (error.response?.status === 404) {
      const err = new Error(`Machine ID ${machineId} tidak ditemukan`);
      err.code = "MACHINE_NOT_FOUND";
      throw err;
    }

    // Build detailed error message
    let errorMessage = error.message || "Unknown error";
    if (error.response) {
      errorMessage = `HTTP ${error.response.status}: ${
        error.response.statusText || errorMessage
      }`;
      if (error.response.data) {
        errorMessage += ` - ${JSON.stringify(error.response.data)}`;
      }
    } else if (error.request) {
      errorMessage = `No response received: ${errorMessage}`;
      if (error.code === "ECONNREFUSED") {
        errorMessage =
          "Connection refused - ML API mungkin tidak berjalan atau URL salah";
      } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
        errorMessage =
          "Request timeout - ML API tidak merespon dalam waktu yang ditentukan";
      }
    }

    throw new ExternalServiceError("ML API (per-machine)", {
      message: errorMessage,
      originalError: error.message,
      code: error.code,
      status: error.response?.status,
      url: error.config?.url,
    });
  }
}

/**
 * Call ML API untuk mendapatkan semua data machines
 * Endpoint: {ML_API_URL}/full-request
 */
async function callMlApiFullRequest() {
  if (!config.mlApiUrl) {
    throw new Error("ML_API_URL belum diset di .env");
  }

  try {
    // Remove trailing slash jika ada, lalu append path
    const baseUrl = config.mlApiUrl.replace(/\/$/, "");
    const url = `${baseUrl}/full-request`;
    console.log(`[ML API] Base URL: ${config.mlApiUrl}`);
    console.log(`[ML API] Calling full-request endpoint: ${url}`);
    console.log(`[ML API] Request started at: ${new Date().toISOString()}`);

    const startTime = Date.now();
    const response = await axios.post(
      url,
      {},
      {
        headers: {
          "ngrok-skip-browser-warning": "true", // Skip ngrok browser warning
          "Content-Type": "application/json",
        },
      }
    );

    const duration = Date.now() - startTime;
    console.log(`[ML API] Full-request completed in ${duration}ms`);
    return response.data;
  } catch (error) {
    // Log detailed error untuk debugging
    console.error(`[ML API] Full-request error details:`, {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
    });

    // Build detailed error message
    let errorMessage = error.message || "Unknown error";
    if (error.response) {
      // HTTP error response
      errorMessage = `HTTP ${error.response.status}: ${
        error.response.statusText || errorMessage
      }`;
      if (error.response.data) {
        errorMessage += ` - ${JSON.stringify(error.response.data)}`;
      }
    } else if (error.request) {
      // Request dibuat tapi tidak ada response (network/timeout)
      errorMessage = `No response received: ${errorMessage}`;
      if (error.code === "ECONNREFUSED") {
        errorMessage =
          "Connection refused - ML API mungkin tidak berjalan atau URL salah";
      } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
        errorMessage =
          "Request timeout - ML API tidak merespon dalam waktu yang ditentukan";
      }
    }

    throw new ExternalServiceError("ML API (full-request)", {
      message: errorMessage,
      originalError: error.message,
      code: error.code,
      status: error.response?.status,
      url: error.config?.url,
    });
  }
}

module.exports = { callMlApi, callMlApiFullRequest };
