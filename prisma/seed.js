const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// KONFIGURASI
const CSV_FILENAME = 'predictive_maintenance.csv'; 
const LIMIT_ROWS = 100; // Mengambil 100 data pertama

async function main() {
  console.log('🧹 Membersihkan data lama (Cleaning Database)...');
  
  // Hapus data child dulu, baru parent
  await prisma.chatMessage.deleteMany({});
  await prisma.chatSession.deleteMany({});
  await prisma.sensorData.deleteMany({});
  await prisma.prediction.deleteMany({});
  await prisma.maintenanceTicket.deleteMany({});
  await prisma.machine.deleteMany({}); 
  
  console.log('✅ Database bersih. Memulai Seeding (1 Product ID = 1 Machine)...');

  // Baca File CSV
  const filePath = path.join(__dirname, '..', CSV_FILENAME);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File ${CSV_FILENAME} tidak ditemukan!`);
    return;
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n').filter(line => line.trim() !== '');
  
  // Skip header
  const dataRows = lines.slice(1, LIMIT_ROWS + 1); 

  console.log(`📊 Memproses ${dataRows.length} baris data...`);

  for (let i = 0; i < dataRows.length; i++) {
    const cols = dataRows[i].split(',');
    if (cols.length < 10) continue;

    // 1. Ambil Data dari CSV
    const rawId = cols[1].trim();    // Product ID (Unik) -> Jadi Machine ID
    const type = cols[2].trim();     // Type (L, M, H)
    
    const airTemp = parseFloat(cols[3]);
    const processTemp = parseFloat(cols[4]);
    const rotSpeed = parseInt(cols[5]);
    const torque = parseFloat(cols[6]);
    const toolWear = parseInt(cols[7]);
    const target = parseInt(cols[8]);
    const failureType = cols[9] ? cols[9].trim() : 'No Failure';

    // 2. Buat (atau Update) Data MESIN
    // Kita pakai 'upsert' jaga-jaga jika di CSV ada Product ID yang duplikat
    await prisma.machine.upsert({
      where: { id: rawId },
      update: {},
      create: {
        id: rawId, // ID Mesin sesuai Product ID (misal: M14860)
        name: `Milling Machine ${rawId}`, 
        // Karena tidak ada kolom 'type', kita simpan di location agar bisa difilter FE
        location: type, // Isinya cuma "L", "M", atau "H"
      }
    });

    // 3. Buat Data SENSOR
    // Simulasi Timestamp: Kita buat berurutan mundur agar timeline terlihat rapi
    const timestamp = new Date();
    timestamp.setMinutes(timestamp.getMinutes() - (dataRows.length - i) * 5);

    await prisma.sensorData.create({
      data: {
        machineId: rawId, // Link ke Product ID tadi
        airTemperature: airTemp,
        processTemperature: processTemp,
        rotationalSpeed: rotSpeed,
        torque: torque,
        toolWear: toolWear,
        timestamp: timestamp,
      }
    });

    // 4. Buat PREDIKSI (Jika Target = 1)
    if (target === 1) {
      await prisma.prediction.create({
        data: {
          machineId: rawId,
          prediction: failureType,
          predictionIndex: 1,
          probability: 0.99,
          rawOutput: [0.01, 0.99],
          riskLevel: 'high',
          recommendation: `Terdeteksi ${failureType}. Segera lakukan maintenance.`,
          predictedAt: timestamp,
        }
      });
    }
    
    // Log progress kecil
    if ((i + 1) % 20 === 0) console.log(`...processed ${i + 1} rows`);
  }

  console.log(`🎉 Selesai! Berhasil import ${dataRows.length} mesin dan sensor.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });