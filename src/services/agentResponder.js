// const { getSensorData, predictAnomaly } = require("./sensorService");

// async function queryAgent(userQuery, machineId) {
//   const data = await getSensorData(machineId);

//   if (userQuery.includes("risiko") || userQuery.includes("predict")) {
//     await predictAnomaly({ machineId, data });
//   }

//   const latestData = data[data.length - 1];
//   const summary = latestData
//     ? `Sensor terakhir (machine ${machineId}) pada ${latestData.timestamp}: temp proses ${latestData.processTemperature}K, rpm ${latestData.rotationalSpeed}, torque ${latestData.torque}.`
//     : "Belum ada data sensor.";

//   return `Query: "${userQuery}". ${summary} Rekomendasi: lakukan inspeksi jika ada anomali pada pola data.`;
// }

// module.exports = { queryAgent };

// src/services/agentResponder.js (ganti sementara)
async function queryAgent(query, machineId) {
  return `Agent sementara offline. Query: "${query}" untuk mesin ${
    machineId || "semua"
  }. Fitur ini akan aktif setelah ML & sensor stabil.`;
}
module.exports = { queryAgent };
