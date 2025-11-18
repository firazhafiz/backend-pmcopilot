const agentResponder = require("../services/agentResponder");

async function handleQuery(req, res) {
  try {
    const { query, machineId } = req.body;
    const response = await agentResponder.queryAgent(query, machineId);
    res.json({ response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { handleQuery };
