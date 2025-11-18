require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5000,
  mlApiUrl: process.env.ML_API_URL,
  geminiApiKey: process.env.GEMINI_API_KEY,
};
