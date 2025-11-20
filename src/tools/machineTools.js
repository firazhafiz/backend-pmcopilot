// src/tools/machineTools.js
const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Tool 1: Cek Status Terkini Mesin
const checkMachineStatusTool = new DynamicStructuredTool({
  name: "check_machine_status",
  description: "Gunakan tool ini untuk mengecek kondisi/status terkini dari sebuah mesin berdasarkan ID-nya. Output berupa data sensor terakhir.",
  schema: z.object({
    machineId: z.string().describe("ID dari mesin yang ingin dicek, contoh: 'M14860'"),
  }),
  func: async ({ machineId }) => {
    try {
      // 1. Cari mesinnya dulu
      const machine = await prisma.machine.findUnique({
        where: { id: machineId },
        include: {
          sensorData: {
            orderBy: { timestamp: "desc" },
            take: 1, // Ambil yang paling baru
          },
        },
      });

      if (!machine) {
        return `Mesin dengan ID '${machineId}' tidak ditemukan di database.`;
      }

      if (!machine.sensorData || machine.sensorData.length === 0) {
        return `Mesin '${machine.name}' ditemukan, tapi belum ada data sensor yang terekam.`;
      }

      const data = machine.sensorData[0];
      
      // Return string JSON agar mudah dibaca AI
      return JSON.stringify({
        machineName: machine.name,
        location: machine.location,
        lastUpdate: data.timestamp,
        temperature: data.airTemperature,
        rotationalSpeed: data.rotationalSpeed,
        torque: data.torque,
        toolWear: data.toolWear
      });

    } catch (error) {
      return `Terjadi error saat mengambil data: ${error.message}`;
    }
  },
});

// Export tools (bisa ditambah tool lain nanti, misal: getMaintenanceHistory)
module.exports = [checkMachineStatusTool];