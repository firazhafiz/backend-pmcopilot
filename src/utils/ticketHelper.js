// src/utils/ticketHelper.js
/**
 * Helper untuk membuat dan manage maintenance tickets
 */

const prisma = require("../lib/prisma");
const { DatabaseError, NotFoundError } = require("./customError");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { HumanMessage } = require("@langchain/core/messages");
const config = require("../config");

// Initialize a small LLM instance for ticket drafting. Uses same API key from config.
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.2,
  apiKey: config.googleApiKey,
});

/**
 * Auto-create maintenance ticket berdasarkan risk level
 * Triggers: risk score >= 60 dan forecast < 72 jam
 */
async function createAutoTicketIfNeeded(machineId, prediction) {
  try {
    const { forecastFailureType, predictedAt } = prediction;

    // Threshold untuk auto-ticket creation
    const HOURS_THRESHOLD = 72;

    // Check if should create ticket
    if (!forecastFailureType || forecastFailureType === "No Failure") {
      return null;
    }

    // Check forecast window
    const hoursUntilFailure = (predictedAt - new Date()) / (1000 * 60 * 60);
    if (hoursUntilFailure > HOURS_THRESHOLD && hoursUntilFailure > 0) {
      console.log(
        `[TICKET] Forecast ${hoursUntilFailure.toFixed(
          1
        )}h outside ${HOURS_THRESHOLD}h window.`
      );
      return null;
    }

    // Map risk level to priority
    let priority = "MEDIUM";
    const hoursUntil = (predictedAt - new Date()) / (1000 * 60 * 60);
    if (hoursUntil <= 24) priority = "URGENT";
    else if (hoursUntil <= 72) priority = "HIGH";

    // Generate ticket issue description
    const issueDescription =
      `Machine: ${machineId}\n` +
      `Failure Type: ${forecastFailureType}\n` +
      `Expected Failure: ${predictedAt.toISOString()}\n` +
      `Auto-created by PMCopilot prediction system`;

    // Create ticket
    const ticket = await prisma.maintenanceTicket.create({
      data: {
        machineId,
        issue: issueDescription,
        status: true,
        priority,
      },
    });

    console.log(
      `[TICKET] ✅ Created ticket #${ticket.id} for machine ${machineId}`
    );

    return ticket;
  } catch (error) {
    if (error.code?.startsWith("P")) {
      throw new DatabaseError("Failed to create maintenance ticket", error);
    }
    throw error;
  }
}

/**
 * Generate a ticket draft using a lightweight LLM prompt.
 * Returns an object { shouldCreate: boolean, title, issue, priority }
 */
async function generateTicketDraft(machineId, sensorData, prediction) {
  try {
    const { forecast, recommendation, predictedAt } = prediction;

    // Quick rule: if below threshold, no draft
    if (!forecast || forecast === "No Failure") {
      return { shouldCreate: false };
    }

    // Build prompt
    const prompt =
      `You are a maintenance assistant. Given the machine id: ${machineId} and the following data:\n` +
      `SENSOR: ${JSON.stringify(sensorData)}\nPREDICTION: ${JSON.stringify(
        prediction
      )}\n` +
      `Produce a JSON object with keys: title, issue (detailed description), priority (URGENT/HIGH/MEDIUM/LOW) decided by time proximity to predictedAt: <=24h URGENT, <=72h HIGH, else MEDIUM. Keep it concise and factual.`;

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const content = response.content || response.output?.[0]?.content || "";

    // Try parse JSON from content
    let parsed = null;
    try {
      // Some LLMs wrap backticks or prose; attempt to extract JSON substring
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : content;
      parsed = JSON.parse(jsonText);
    } catch (e) {
      // fallback to rule-based draft
      parsed = {
        title: `Maintenance: ${machineId} - ${
          forecast || "Investigation required"
        }`,
        issue: `Auto-generated ticket. Machine ${machineId}. Forecast: ${forecast}. Recommendation: ${recommendation}. Predicted at: ${
          predictedAt?.toISOString?.() || predictedAt
        }`,
        priority: (() => {
          const hours = (new Date(predictedAt) - new Date()) / (1000 * 60 * 60);
          if (hours <= 24) return "URGENT";
          if (hours <= 72) return "HIGH";
          return "MEDIUM";
        })(),
      };
    }

    return {
      shouldCreate: true,
      title: parsed.title || `Maintenance: ${machineId}`,
      issue:
        parsed.issue ||
        parsed.description ||
        parsed.details ||
        parsed.issue ||
        "See attached prediction.",
      priority: parsed.priority || "MEDIUM",
    };
  } catch (error) {
    console.warn("[TICKET][LLM] Draft generation failed:", error.message);
    return { shouldCreate: false };
  }
}

/**
 * Get recent tickets untuk dashboard
 */
async function getRecentTickets(machineId = null, limit = 10) {
  try {
    const where = machineId ? { machineId } : {};

    const tickets = await prisma.maintenanceTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        machine: {
          select: { type: true },
        },
      },
    });

    return tickets;
  } catch (error) {
    throw new DatabaseError("Failed to fetch tickets", error);
  }
}

/**
 * Update ticket status
 */
async function updateTicketStatus(ticketId, status) {
  try {
    if (typeof status !== "boolean") {
      throw new Error(
        "Invalid status. Must be boolean: true=opened, false=closed"
      );
    }

    const ticket = await prisma.maintenanceTicket.update({
      where: { id: ticketId },
      data: {
        status,
        ...(status === false && { closedAt: new Date() }),
      },
    });

    return ticket;
  } catch (error) {
    if (error.code === "P2025") {
      throw new NotFoundError("Ticket");
    }
    throw new DatabaseError("Failed to update ticket", error);
  }
}

module.exports = {
  createAutoTicketIfNeeded,
  getRecentTickets,
  updateTicketStatus,
  generateTicketDraft,
};
