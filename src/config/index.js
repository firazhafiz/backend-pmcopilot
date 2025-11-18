require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5000,
  mlApiUrl: process.env.ML_API_URL,
  googleApiKey: process.env.GOOGLE_API_KEY,
  directDatabaseUrl: process.env.DIRECT_URL,
};
