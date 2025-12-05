// src/utils/errorHandler.js
/**
 * Global Error Handler Middleware
 * Menangani semua error dari aplikasi dengan response format yang konsisten
 */

const {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  DatabaseError,
} = require("./customError");

/**
 * Map Prisma error codes ke HTTP status dan message
 */
function mapPrismaError(err) {
  const errorMap = {
    P2002: {
      status: 409,
      message: `Unique constraint violation on field(s): ${
        err.meta?.target?.join(", ") || "unknown"
      }`,
      code: "UNIQUE_CONSTRAINT",
    },
    P2025: {
      status: 404,
      message: "Record not found",
      code: "RECORD_NOT_FOUND",
    },
    P2003: {
      status: 400,
      message: "Foreign key constraint violation",
      code: "FK_CONSTRAINT",
    },
    P2014: {
      status: 400,
      message: "Required relation violation",
      code: "REQUIRED_RELATION",
    },
    P2005: {
      status: 500,
      message: "Invalid field value type",
      code: "INVALID_FIELD_TYPE",
    },
  };

  return (
    errorMap[err.code] || {
      status: 500,
      message: "Database operation failed",
      code: "DB_ERROR",
    }
  );
}

/**
 * Format error response
 */
function formatErrorResponse(error, requestId, isDev = false) {
  const response = {
    success: false,
    error: {
      message: error.message || "Internal Server Error",
      code: error.code || "UNKNOWN_ERROR",
      timestamp: error.timestamp || new Date().toISOString(),
      requestId,
    },
  };

  // Tambah details untuk validation error
  if (error instanceof ValidationError && error.details) {
    response.error.details = error.details;
  }

  // Tambah originalError untuk ExternalServiceError
  if (error instanceof ExternalServiceError && error.originalError) {
    response.error.details = error.originalError;
    if (typeof error.originalError === "object") {
      response.error.details = error.originalError;
    } else {
      response.error.details = { message: error.originalError };
    }
  }

  // Tambah stack trace di development
  if (isDev && error.stack) {
    response.error.stack = error.stack.split("\n");
  }

  return response;
}

/**
 * Main error handler middleware
 */
function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== "production";
  const requestId = req.requestId || "unknown";

  let statusCode = 500;
  let error = err;

  // ===================================
  // ERROR CLASSIFICATION
  // ===================================

  // 1. Custom AppError instances
  if (error instanceof AppError) {
    statusCode = error.statusCode;
  }
  // 2. Prisma Database Errors
  else if (error.code && String(error.code).startsWith("P")) {
    const prismaError = mapPrismaError(error);
    statusCode = prismaError.status;
    error = new AppError(prismaError.message, statusCode, prismaError.code);
  }
  // 3. Zod Validation Errors (jika tidak di-catch di middleware)
  else if (error.name === "ZodError") {
    const details = error.errors.map((err) => ({
      path: err.path.join("."),
      message: err.message,
      code: err.code,
    }));
    statusCode = 400;
    error = new ValidationError("Validation failed", details);
  }
  // 4. JSON Parse Errors
  else if (error instanceof SyntaxError && error.status === 400) {
    statusCode = 400;
    error = new ValidationError("Invalid JSON in request body");
  }
  // 5. Default Internal Server Error
  else if (!(error instanceof AppError)) {
    statusCode = 500;
    error = new AppError(
      error.message || "Internal Server Error",
      500,
      "INTERNAL_ERROR"
    );
  }

  // ===================================
  // LOGGING
  // ===================================

  const logMessage =
    `[${requestId}] ${req.method} ${req.path} | ` +
    `Status: ${statusCode} | Code: ${error.code || "UNKNOWN"}`;

  if (statusCode >= 500) {
    console.error(`❌ ${logMessage}`);
    console.error(err.stack);
  } else if (statusCode >= 400) {
    console.warn(`⚠️  ${logMessage}`);
  } else {
    console.log(`✅ ${logMessage}`);
  }

  // ===================================
  // SEND RESPONSE
  // ===================================

  const responseBody = formatErrorResponse(error, requestId, isDev);

  res.status(statusCode).json(responseBody);
}

/**
 * Handle 404 Not Found
 */
function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Route ${req.originalUrl}`);
  next(error);
}

module.exports = {
  errorHandler,
  notFoundHandler,
  formatErrorResponse,
};
