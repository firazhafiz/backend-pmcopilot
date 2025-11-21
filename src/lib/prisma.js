// src/lib/prisma.js
const { PrismaClient } = require("@prisma/client");
const config = require("../config");

// Mencegah multiple instances saat hot-reloading di development
const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: config.directDatabaseUrl,
    },
  },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

module.exports = prisma;