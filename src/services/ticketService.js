// src/services/ticketService.js

// Helper: Tentukan Prioritas
function determinePriority(currentFailure, forecastFailure) {
  if (currentFailure === "Maintenance") return "low";

  const highRisk = [
    "Power Failure",
    "Heat Dissipation Failure",
    "Overstrain Failure",
  ];

  if (highRisk.includes(currentFailure) || highRisk.includes(forecastFailure))
    return "high";
  if (currentFailure === "No Failure" && forecastFailure === "No Failure")
    return "low";

  return "medium";
}

// Helper: Generator Deskripsi
function generateDescription(mlData, currentFailure, forecastFailure) {
  if (currentFailure === "Maintenance") {
    return `[STATUS: MAINTENANCE MODE]\nMesin sedang dalam perbaikan rutin. Sensor dinonaktifkan sementara.`;
  }

  const targetFailure =
    currentFailure !== "No Failure" ? currentFailure : forecastFailure;

  // Peta Diagnosa
  const diagnosisMap = {
    "Power Failure": "Indikasi: Kegagalan daya mendadak. Cek suplai listrik.",
    "Tool Wear Failure":
      "Indikasi: Keausan alat melebihi batas. Ganti komponen pemotong.",
    "Overstrain Failure":
      "Indikasi: Beban berlebih (Torsi tinggi). Cek sumbatan.",
    "Heat Dissipation Failure":
      "Indikasi: Pendinginan gagal. Cek kipas/coolant.",
    "Random Failures": "Indikasi: Kegagalan acak. Cek log sistem.",
    "No Failure": "Normal.",
  };

  const technicalAdvice =
    diagnosisMap[targetFailure] || "Lakukan inspeksi umum.";

  let header = "";
  if (currentFailure !== "No Failure") {
    header = `🚨 [URGENT] KERUSAKAN TERDETEKSI: ${currentFailure.toUpperCase()}`;
  } else if (forecastFailure !== "No Failure") {
    header = `⚠️ [PREDIKSI] POTENSI KERUSAKAN: ${forecastFailure.toUpperCase()} (${
      mlData["Forecast Failure Countdown"]
    })`;
  }

  return `
${header}

🛠️ DIAGNOSA SISTEM
${technicalAdvice}

📊 SNAPSHOT DATA SENSOR
• Suhu Udara      : ${mlData["Air temperature [K]"]} K
• Suhu Proses     : ${mlData["Process temperature [K]"]} K
• RPM             : ${mlData["Rotational speed [rpm]"]}
• Torsi           : ${mlData["Torque [Nm]"]}
• Tool Wear       : ${mlData["Tool wear [min]"]}

📅 Waktu Laporan: ${new Date().toLocaleString("id-ID")}
  `.trim();
}

/**
 * FUNGSI UTAMA: Cek & Buat Tiket
 * @param {Object} tx - Prisma Transaction Client (Wajib pass 'tx' agar atomic)
 * @param {string} machineId
 * @param {Object} mlData - Raw output dari Python
 * @param {string} currentFailure
 * @param {string} forecastFailure
 */
async function processAutoTicket(
  tx,
  machineId,
  mlData,
  currentFailure,
  forecastFailure
) {
  const isMaintenance = currentFailure === "Maintenance";

  // 🛑 FIX LOGIC DISINI
  // Pastikan Forecast BUKAN "Maintenance"
  const isForecastIssue =
    forecastFailure !== "No Failure" && forecastFailure !== "Maintenance";

  // Logic:
  // 1. Current Failure ada (dan bukan maintenance)
  // 2. ATAU Forecast Failure ada (dan bukan maintenance)
  const isRealFailure =
    (currentFailure !== "No Failure" && !isMaintenance) ||
    (isForecastIssue && !isMaintenance);

  if (!isRealFailure) return null; // Tidak perlu tiket

  const failureTitle =
    currentFailure !== "No Failure"
      ? currentFailure
      : `PREDICTION: ${forecastFailure}`;

  const existing = await tx.maintenanceTicket.findFirst({
    where: {
      machineId,
      status: "open",
      title: { contains: failureTitle },
    },
  });

  if (existing) {
    // console.log(`[TICKET] Skip. Tiket sudah ada.`); // Optional Log
    return null; // Return null jika sudah ada, biar frontend ga notif terus
  }

  console.log(`[TICKET] Membuat tiket baru: ${failureTitle}`);
  const newTicket = await tx.maintenanceTicket.create({
    data: {
      machineId,
      title: `[ALERT] ${failureTitle}`,
      description: generateDescription(mlData, currentFailure, forecastFailure), // Pastikan helper ini ada di file ini
      priority: determinePriority(currentFailure, forecastFailure), // Pastikan helper ini ada di file ini
      status: "open",
      createdAt: new Date(),
    },
  });

  return newTicket;
}

module.exports = { processAutoTicket };
