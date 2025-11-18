// src/utils/errorHandler.js

function errorHandler(err, req, res, next) {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || "Internal Server Error";

  if (statusCode === 404) {
    message = `Resource not found: ${req.originalUrl}`;
  }

  if (err.code && String(err.code).startsWith("P")) {
    switch (err.code) {
      case "P2002":
        statusCode = 409;
        message = `Conflict: Data already exists or unique constraint failed on field(s): ${err.meta.target.join(
          ", "
        )}`;
        break;
      case "P2025":
        statusCode = 404;
        message = "Requested record not found.";
        break;
      default:
        statusCode = 500;
        message = "Database operation failed.";
        break;
    }
  }

  console.error(`[STATUS: ${statusCode}]`, err.stack);

  res.status(statusCode).json({
    error: message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
}

module.exports = errorHandler;
