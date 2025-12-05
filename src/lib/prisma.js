// src/lib/prisma.js
const { PrismaClient } = require("@prisma/client");
const config = require("../config");

// Mencegah multiple instances saat hot-reloading di development
const globalForPrisma = global;

/**
 * Helper: Tambahkan connection pool parameters ke DATABASE_URL jika belum ada
 * Connection limit disesuaikan dengan pool_size database (biasanya 10-20)
 * 
 * Untuk PostgreSQL dengan Prisma, parameter yang didukung:
 * - connection_limit: jumlah maksimal koneksi simultan (default: tidak terbatas)
 * - pool_timeout: timeout dalam detik untuk mendapatkan koneksi dari pool (default: 10)
 */
function addConnectionPoolParams(url) {
  if (!url) {
    console.warn("[PRISMA] DIRECT_URL tidak ditemukan, menggunakan URL default");
    return url;
  }
  
  // Jika sudah ada parameter connection_limit, skip
  if (url.includes("connection_limit")) {
    console.log("[PRISMA] Connection pool parameters sudah ada di URL");
    return url;
  }
  
  // Tambahkan connection_limit dan pool_timeout ke URL
  // connection_limit: maksimal 10 koneksi simultan (sesuai dengan pool_size database yang umum)
  // pool_timeout: timeout 10 detik untuk mendapatkan koneksi dari pool
  const separator = url.includes("?") ? "&" : "?";
  const urlWithParams = `${url}${separator}connection_limit=10&pool_timeout=10`;
  
  console.log("[PRISMA] Connection pool parameters ditambahkan ke URL");
  console.log(`[PRISMA] connection_limit=10, pool_timeout=10`);
  
  return urlWithParams;
}

// Konfigurasi Prisma Client dengan connection pool
const prismaConfig = {
  datasources: {
    db: {
      url: addConnectionPoolParams(config.directDatabaseUrl),
    },
  },
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
};

const prisma = globalForPrisma.prisma || new PrismaClient(prismaConfig);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

module.exports = prisma;