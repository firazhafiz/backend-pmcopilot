const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const machineCoreService = require("../services/machineCoreService");

const checkMachineHealthTool = new DynamicStructuredTool({
  name: "check_machine_health",
  // DESKRIPSI INI SAYA PERTAJAM AGAR AI TIDAK RAGU MEMANGGILNYA
  description: "TOOL WAJIB. Panggil ini KAPANPUN user menyebutkan ID Mesin (misal M14860). Jangan jawab manual, gunakan data dari tool ini.",
  schema: z.object({
    machineId: z.string().describe("ID Mesin, contoh: 'M14860'"),
  }),
  func: async ({ machineId }) => {
    try {
      // 1. PANGGIL CORE SERVICE
      const result = await machineCoreService.getMachineStatus(machineId);
      
      const { sensorData, predictionResult } = result;

      // 2. FORMAT HASIL AGAR DIMENGERTI GEMINI
      return JSON.stringify({
        info: {
            machine_id: machineId,
            data_source: result.source, // "DATABASE" atau "ML API"
            timestamp: sensorData.timestamp, 
            type: "FULL_ANALYSIS"
        },
        current_readings: {
            type: sensorData.type,
            air_temp: `${sensorData.airTemperature} K`,
            process_temp: `${sensorData.processTemperature} K`,
            rpm: `${sensorData.rotationalSpeed} RPM`,
            torque: `${sensorData.torque} Nm`,
            tool_wear: `${sensorData.toolWear} min`
        },
        ai_analysis: {
            condition: predictionResult.prediction,      
            risk_level: predictionResult.riskLevel,      
            recommendation: predictionResult.recommendation,
            confidence: `${(predictionResult.probability * 100).toFixed(2)}%`
        }
      });

    } catch (error) {
      if (error.code === "MACHINE_NOT_FOUND") {
        return `INFO: Mesin ${machineId} tidak ditemukan di database maupun sistem ML.`;
      }
      console.error("Tool Error:", error);
      return `ERROR: Gagal mengambil data. Detail: ${error.message}`;
    }
  },
});

module.exports = [checkMachineHealthTool];