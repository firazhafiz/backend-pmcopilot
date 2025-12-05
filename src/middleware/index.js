// src/middleware/index.js
/**
 * Export semua middleware dari satu tempat
 */

const { validateRequest } = require("./validateRequest");
const { logger } = require("./logger");

module.exports = {
  validateRequest,
  logger,
};
