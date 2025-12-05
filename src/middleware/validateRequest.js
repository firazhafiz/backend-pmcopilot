// src/middleware/validateRequest.js
/**
 * Middleware untuk validasi request menggunakan Zod schemas
 */

const { ValidationError } = require("../utils/customError");

/**
 * Factory function untuk membuat validation middleware
 * @param {Object} schema - Zod schema dengan struktur { body?, params?, query? }
 * @returns {Function} Express middleware
 */
function validateRequest(schema) {
  return (req, res, next) => {
    try {
      const dataToValidate = {};

      // Validasi body jika ada di schema
      if (schema.shape?.body) {
        dataToValidate.body = req.body;
      }

      // Validasi params jika ada di schema
      if (schema.shape?.params) {
        dataToValidate.params = req.params;
      }

      // Validasi query jika ada di schema
      if (schema.shape?.query) {
        dataToValidate.query = req.query;
      }

      // Jalankan validasi
      const result = schema.safeParse(dataToValidate);

      if (!result.success) {
        const errors = (result.error.issues || []).map((err) => ({
          path: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        throw new ValidationError("Request validation failed", errors);
      }

      // Attach validated data ke request object untuk digunakan di controller
      req.validated = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { validateRequest };
