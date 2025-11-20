// delete_predictions.js
const { PrismaClient } = require("@prisma/client");
const config = require("./src/config");

// Gunakan konfigurasi koneksi direct (5432) yang sama dengan di backend Anda
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: config.directDatabaseUrl,
        },
    },
});

async function cleanupPredictions() {
    console.log("Menghubungkan ke database...");
    
    try {
        await prisma.$connect();

        console.log("✅ Koneksi berhasil. Menghapus semua data dari tabel 'predictions'...");
        
        // Perintah deleteMany tanpa 'where' akan menghapus semua data
        const result = await prisma.prediction.deleteMany({});
        
        console.log(`🗑️ Berhasil menghapus ${result.count} baris dari tabel 'predictions'.`);

        // OPTIONAL: Reset sequence ID (Jika Anda ingin ID dimulai dari 1 lagi, mirip TRUNCATE RESTART IDENTITY)
        // Note: Perintah $executeRaw memerlukan database yang sudah bersih,
        // tapi ini akan mengulang fungsi RESTART IDENTITY dari SQL.
        // Jika Anda tidak yakin, lewati langkah ini.
        // await prisma.$executeRaw`ALTER SEQUENCE predictions_id_seq RESTART WITH 1;`;
        // console.log("ID sequence direset.");


    } catch (error) {
        console.error("❌ Gagal membersihkan tabel prediksi.");
        console.error("Pastikan variabel DIRECT_URL di .env sudah benar dan menggunakan hostname non-pooler (tanpa '.pooler.').");
        console.error("Detail Error:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

cleanupPredictions();