// src/utils/mlPayloadMapper.js
/**
 * Helper untuk map dan parse ML API response
 * Konversi Kelvin ke Celsius dan normalisasi data
 */

const { ValidationError, ExternalServiceError } = require("./customError");
const { mlApiResponseSchema } = require("../validators/schemas");

// Konstanta konversi suhu
const KELVIN_TO_CELSIUS = 273.15;

/**
 * Konversi Kelvin ke Celsius
 */
function kelvinToCelsius(kelvin) {
  return Number(kelvin) - KELVIN_TO_CELSIUS;
}

/**
 * Hitung risk score berdasarkan sensor data dan ML prediction
 * Formula sederhana: kombinasi dari temperatur delta, tool wear, dan torque
 */
function computeRiskScore(sensorData, machineTypeBaseline = {}) {
  const {
    airTemperature,
    processTemperature,
    toolWear,
    torque,
    rotationalSpeed,
  } = sensorData;

  const defaults = {
    tempDangerDelta: 15,
    expectedToolLife: 1000,
    maxTorque: 200,
    maxRpm: 3000,
  };

  const config = { ...defaults, ...machineTypeBaseline };

  // Normalize scores (0-1)
  const tempDelta = Math.max(0, processTemperature - airTemperature);
  const tempScore = Math.min(1, tempDelta / config.tempDangerDelta);

  const wearScore = Math.min(1, toolWear / config.expectedToolLife);

  const torqueScore = Math.min(1, Math.abs(torque) / config.maxTorque);

  const rpmScore = Math.min(1, rotationalSpeed / config.maxRpm);

  // Weighted sum
  const score =
    tempScore * 0.35 + wearScore * 0.3 + torqueScore * 0.2 + rpmScore * 0.15;

  return Math.round(score * 100);
}

/**
 * Map risk score ke risk level
 */
function mapRiskLevel(riskScore) {
  if (riskScore >= 85) return "critical";
  if (riskScore >= 60) return "high";
  if (riskScore >= 30) return "medium";
  return "low";
}

/**
 * Generate rekomendasi berdasarkan failure type dan risk score
 */
function generateRecommendation(
  forecastFailureType,
  riskScore,
  predictedFailureType = null
) {
  const recommendations = {
    "No Failure": "Operasi normal. Monitor terus performa mesin.",
    Maintenance:
      "Mesin sedang dalam maintenance. Tunggu hingga proses maintenance selesai.",
    "Power Failure":
      "Risiko power failure terdeteksi. Periksa sistem power supply dan kabel. Siapkan backup power.",
    "Tool Wear Failure":
      "Tool wear tinggi. Lakukan penggantian tool segera untuk mencegah kerusakan.",
    "Overstrain Failure":
      "Beban kerja berlebihan. Kurangi load atau tingkatkan maintenance frequency.",
    "Heat Dissipation Failure":
      "Masalah pendinginan. Periksa sistem cooling dan ventilasi. Bersihkan filter.",
    "Random Failures":
      "Ada indikasi random failure. Lakukan inspeksi lengkap dan diagnostik.",
  };

  // Jika predicted failure type adalah Maintenance, gunakan rekomendasi maintenance
  if (predictedFailureType === "Maintenance") {
    return recommendations["Maintenance"];
  }

  let baseRecommendation =
    recommendations[forecastFailureType] ||
    "Lakukan inspeksi dan maintenance rutin.";

  // Jangan tambahkan urgency untuk mesin maintenance
  if (predictedFailureType === "Maintenance") {
    return baseRecommendation;
  }

  // Tambah urgency jika risk score tinggi (hanya untuk mesin yang beroperasi)
  if (riskScore >= 85) {
    baseRecommendation +=
      " URGENT: Jadwalkan inspeksi dalam 24 jam berikutnya.";
  } else if (riskScore >= 60) {
    baseRecommendation += " Priority: Rencanakan maintenance dalam 48-72 jam.";
  }

  return baseRecommendation;
}

/**
 * Parse dan validate ML API response
 * @param {Object} mlResponse - Raw response dari ML API
 * @returns {Object} Parsed dan normalized data
 */
function parseMLResponse(mlResponse) {
  try {
    // Some ML endpoints return a wrapped object { success: true, data: { sensorData, predictionResult } }
    // Normalize common wrapper shapes into the flat shape expected by our Zod schema.
    let candidate = mlResponse;

    // Log raw response untuk debugging (hanya untuk development)
    if (process.env.NODE_ENV !== "production" && !candidate["Machine ID"]) {
      console.log(
        `[ML Parser] Raw response keys:`,
        Object.keys(candidate || {})
      );
    }

    if (mlResponse && typeof mlResponse === "object") {
      if (mlResponse.success && mlResponse.data) candidate = mlResponse.data;
      // Support case where top-level has sensorData & predictionResult
      if (candidate.sensorData && candidate.predictionResult) {
        const s = candidate.sensorData;
        const p = candidate.predictionResult;

        // Helper: convert Celsius->Kelvin when value seems low (< 200)
        const toKelvinIfNeeded = (val) => {
          const n = Number(val);
          if (isNaN(n)) return val;
          return n > 200 ? n : n + KELVIN_TO_CELSIUS;
        };

        candidate = {
          "Machine ID": s.machineId || s.machineID || s.id,
          Type: s.type || s.machineType || s.Type,
          "Air temperature [K]": toKelvinIfNeeded(s.airTemperature),
          "Process temperature [K]": toKelvinIfNeeded(s.processTemperature),
          "Rotational speed [rpm]":
            s.rotationalSpeed || s.rpm || s.rotationalSpeed,
          "Torque [Nm]": s.torque || s.Torque,
          "Tool wear [min]": s.toolWear || s.tool_wear || s.toolWear,
          // Prediction fields
          "Predicted Failure Type":
            p.currentFailure ||
            p.prediction ||
            p.predictedFailure ||
            p.predicted_failure,
          "Forecast Failure Type":
            p.forecast || p.forecastFailure || p.forecast_failure,
          "Forecast Failure Timestamp":
            p.predictedAt ||
            p.predicted_at ||
            p.predictedAt ||
            p.predicted_at ||
            p.predictedAt,
          "Forecast Failure Countdown":
            p.countdown || p.forecastCountdown || p.forecast_countdown,
        };

        // Include raw sensor timestamp if present
        if (s.timestamp) candidate.Timestamp = s.timestamp;
      }
    }

    // Validate the (possibly normalized) structure
    let validated;
    try {
      validated = mlApiResponseSchema.parse(candidate);
    } catch (validationError) {
      // Log candidate structure untuk debugging
      console.error(
        `[ML Parser] Validation failed. Candidate structure:`,
        JSON.stringify(candidate, null, 2).substring(0, 1000)
      );
      throw validationError;
    }

    // Konversi string ke number jika perlu
    const airTempK = Number(validated["Air temperature [K]"]);
    const processTempK = Number(validated["Process temperature [K]"]);
    const rotationalSpeed = Number(validated["Rotational speed [rpm]"]);
    const torque = Number(validated["Torque [Nm]"]);
    const toolWear = Number(validated["Tool wear [min]"]);

    // Determine predicted failure type untuk cek apakah maintenance
    const predictedFailureType = validated["Predicted Failure Type"];
    const isMaintenance = predictedFailureType === "Maintenance";

    // Untuk maintenance, simpan nilai asli dari ML (0.0), bukan konversi
    // Untuk mesin normal, konversi Kelvin ke Celsius
    let airTempC, processTempC;
    if (isMaintenance || airTempK === 0) {
      // Maintenance: simpan nilai asli dari ML (0.0)
      airTempC = 0.0;
      processTempC = 0.0;
    } else {
      // Normal: konversi Kelvin ke Celsius
      airTempC = kelvinToCelsius(airTempK);
      processTempC = kelvinToCelsius(processTempK);
    }

    // Determine sensor timestamp: use ML-provided timestamp if available, otherwise now
    let sensorTimestamp = new Date();
    if (validated["Timestamp"] || validated["timestamp"]) {
      const rawTs = validated["Timestamp"] || validated["timestamp"];
      const parsed = Date.parse(rawTs);
      if (!isNaN(parsed)) {
        sensorTimestamp = new Date(parsed);
      } else {
        // Try a tolerant parse for common formats (e.g. "YYYY-MM-DD HH:mm:ss")
        const tolerant =
          rawTs.replace(" ", "T") + (rawTs.endsWith("Z") ? "" : "Z");
        const p2 = Date.parse(tolerant);
        if (!isNaN(p2)) sensorTimestamp = new Date(p2);
      }
    }

    const sensorData = {
      machineId: validated["Machine ID"],
      machineType: validated["Type"],
      airTemperature: isMaintenance ? 0.0 : Math.round(airTempC * 100) / 100,
      processTemperature: isMaintenance
        ? 0.0
        : Math.round(processTempC * 100) / 100,
      rotationalSpeed: isMaintenance ? 0 : rotationalSpeed,
      torque: isMaintenance ? 0.0 : Math.round(torque * 100) / 100,
      toolWear: isMaintenance ? 0 : toolWear,
      timestamp: sensorTimestamp,
    };

    // Untuk mesin maintenance, set risk score rendah karena memang sedang maintenance
    // Untuk mesin lain, hitung risk score normal
    let riskScore, riskLevel;
    if (isMaintenance) {
      // Mesin maintenance: risk score rendah karena memang sedang maintenance
      riskScore = 0;
      riskLevel = "low";
    } else {
      // Hitung risk score normal untuk mesin yang beroperasi
      riskScore = computeRiskScore(sensorData);
      riskLevel = mapRiskLevel(riskScore);
    }

    // Determine forecast failure type
    // Jika tidak ada "Forecast Failure Type" di response, berarti "No Failure"
    // Jika "Predicted Failure Type" adalah "Maintenance", maka forecast = null
    const forecastFailureTypeRaw = validated["Forecast Failure Type"];

    let forecastFailureType = null; // Default null untuk maintenance
    if (isMaintenance) {
      // Mesin maintenance: forecast = null
      forecastFailureType = null;
    } else if (
      forecastFailureTypeRaw &&
      forecastFailureTypeRaw !== "No Failure"
    ) {
      forecastFailureType = forecastFailureTypeRaw;
    } else {
      forecastFailureType = "No Failure";
    }

    // Generate rekomendasi
    const recommendation = generateRecommendation(
      forecastFailureType,
      riskScore,
      predictedFailureType
    );

    // Determine predictedAt using multiple fallbacks:
    // 1) ML provided exact "Forecast Failure Timestamp"
    // 2) ML provided "Forecast Failure Countdown" (e.g. "15 hours") -> add to sensor timestamp
    // 3) fallback: sensor timestamp
    let predictedAt = new Date(sensorTimestamp);

    const forecastTsRaw = validated["Forecast Failure Timestamp"];
    const forecastCountdown = validated["Forecast Failure Countdown"];

    if (forecastTsRaw) {
      // Try direct parse first
      let parsed = Date.parse(forecastTsRaw);
      if (!isNaN(parsed)) {
        predictedAt = new Date(parsed);
      } else {
        // Handle "YYYY-MM-DD HH:mm:ss" format by replacing space with T and adding Z
        const tolerantFormat = String(forecastTsRaw).trim().replace(" ", "T");
        const tolerantWithZ = tolerantFormat.endsWith("Z")
          ? tolerantFormat
          : tolerantFormat + "Z";
        const p2 = Date.parse(tolerantWithZ);
        if (!isNaN(p2)) {
          predictedAt = new Date(p2);
        }
      }
    } else if (forecastCountdown) {
      // Try to extract number + unit from countdown string
      const s = String(forecastCountdown).toLowerCase().trim();
      const m = s.match(/([0-9]+)\s*(hour|hours|hr|hrs|h)/);
      const mm = s.match(/([0-9]+)\s*(minute|minutes|min|m)/);
      const md = s.match(/([0-9]+)\s*(day|days|d)/);

      if (m) {
        const hours = parseInt(m[1], 10);
        predictedAt = new Date(sensorTimestamp.getTime() + hours * 3600 * 1000);
      } else if (mm) {
        const mins = parseInt(mm[1], 10);
        predictedAt = new Date(sensorTimestamp.getTime() + mins * 60 * 1000);
      } else if (md) {
        const days = parseInt(md[1], 10);
        predictedAt = new Date(
          sensorTimestamp.getTime() + days * 24 * 3600 * 1000
        );
      } else {
        // If it's a plain number, assume hours
        const n = parseFloat(s);
        if (!isNaN(n))
          predictedAt = new Date(sensorTimestamp.getTime() + n * 3600 * 1000);
      }
    }

    // Build a normalized rawPayload (only ML-specific fields, no sensor duplication)
    // Hanya simpan forecast fields jika memang ada forecast failure
    const rawPayloadNormalized = {
      predictedFailureType: validated["Predicted Failure Type"],
    };

    // Hanya tambahkan forecast fields jika memang ada forecast failure
    if (
      forecastFailureType &&
      forecastFailureType !== "No Failure" &&
      forecastFailureType !== "Maintenance"
    ) {
      rawPayloadNormalized.forecastFailureType = forecastFailureType;
      rawPayloadNormalized.forecastFailureTimestampRaw =
        validated["Forecast Failure Timestamp"] || null;
      rawPayloadNormalized.forecastFailureCountdownRaw =
        validated["Forecast Failure Countdown"] || null;
    }

    return {
      sensorData,
      prediction: {
        machineId: validated["Machine ID"],
        prediction: validated["Predicted Failure Type"],
        forecast: forecastFailureType,
        recommendation,
        predictedAt,
        rawPayload: rawPayloadNormalized,
      },
    };
  } catch (error) {
    if (error.name === "ZodError") {
      throw new ValidationError("Invalid ML API response format", error.errors);
    }
    throw new ExternalServiceError("ML API", error);
  }
}

module.exports = {
  kelvinToCelsius,
  computeRiskScore,
  mapRiskLevel,
  generateRecommendation,
  parseMLResponse,
};
