// src/middleware/logger.js
/**
 * Logging middleware untuk track request/response
 */

const logger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  // Store request info untuk logging di error handler
  req.requestId = requestId;

  // Override res.json untuk log response
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const duration = Date.now() - startTime;
    console.log(
      `[${req.requestId}] ${req.method} ${req.path} | Status: ${res.statusCode} | Duration: ${duration}ms`
    );
    return originalJson(data);
  };

  next();
};

module.exports = { logger };
