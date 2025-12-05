// src/controllers/agentController.js
/**
 * Agent Controller
 * Handle chatbot dan agent interactions
 */

const { handleUserMessage } = require("../services/agentService");
const prisma = require("../lib/prisma");
const crypto = require("crypto");
const { NotFoundError, ValidationError } = require("../utils/customError");

/**
 * POST /agent/chat | POST /agent/chat/:sessionId
 * Chat dengan agent - new session atau existing session
 */
async function chatWithAgent(req, res, next) {
  try {
    const { message } = req.validated.body;
    let { sessionId } = req.validated.params || {};

    // Jika sessionId tidak ada (new chat) -> generate UUID baru
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      console.log(`[AGENT] New chat session created: ${sessionId}`);
    }

    console.log(
      `[AGENT] Chat message from session ${sessionId}: "${message.substring(
        0,
        50
      )}..."`
    );

    // Panggil agent service
    const reply = await handleUserMessage(sessionId, message);

    // Success response
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        reply,
        timestamp: new Date().toISOString(),
      },
      message: "Message processed successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agent/chat/:sessionId
 * Get chat history untuk session tertentu
 */
async function getSessionHistory(req, res, next) {
  try {
    const { sessionId } = req.validated.params;

    console.log(`[AGENT] Fetching chat history for session: ${sessionId}`);

    // Fetch session dengan messages
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    // Check if session exists
    if (!session) {
      throw new NotFoundError(`Chat session ${sessionId}`);
    }

    // Format response
    const formattedMessages = session.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    }));

    // Success response
    res.status(200).json({
      success: true,
      data: {
        sessionId: session.id,
        title: session.title,
        messages: formattedMessages,
        messageCount: formattedMessages.length,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      message: "Chat history retrieved successfully",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { chatWithAgent, getSessionHistory };
