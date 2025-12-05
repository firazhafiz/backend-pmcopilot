// src/validators/schemas.js
/**
 * Validation Schemas menggunakan Zod
 * Centralized validation untuk semua request payload
 */

const { z } = require("zod");

// ==========================================
// SENSOR ENDPOINTS VALIDATORS
// ==========================================

const postMachineSchema = z.object({
  body: z.object({
    machineId: z
      .string()
      .min(1, "Machine ID tidak boleh kosong")
      .max(50, "Machine ID terlalu panjang")
      .regex(
        /^[A-Z0-9_]+$/,
        "Machine ID hanya boleh huruf besar, angka, dan underscore"
      ),
  }),
});

// Params-based validator for POST /machines/:machineId/predict
const postMachineByIdSchema = z.object({
  params: z.object({
    machineId: z
      .string()
      .min(1, "Machine ID tidak boleh kosong")
      .max(50, "Machine ID terlalu panjang")
      .regex(
        /^[A-Z0-9_]+$/,
        "Machine ID hanya boleh huruf besar, angka, dan underscore"
      ),
  }),
});

// Validator for GET /machines/:machineId
const getMachineByIdSchema = z.object({
  params: z.object({
    machineId: z
      .string()
      .min(1, "Machine ID tidak boleh kosong")
      .max(50, "Machine ID terlalu panjang")
      .regex(
        /^[A-Z0-9_]+$/,
        "Machine ID hanya boleh huruf besar, angka, dan underscore"
      ),
  }),
});

const getMachinesSchema = z.object({
  query: z.object({
    limit: z
      .string()
      .optional()
      .refine(
        (val) => !val || !isNaN(parseInt(val)),
        "Limit harus berupa angka"
      ),
    offset: z
      .string()
      .optional()
      .refine(
        (val) => !val || !isNaN(parseInt(val)),
        "Offset harus berupa angka"
      ),
  }),
});

// ==========================================
// AGENT ENDPOINTS VALIDATORS
// ==========================================

// Validator for POST /machines (no body required - gets all from ML API)
const postPredictSchema = z.object({
  body: z.object({}).optional().or(z.undefined()),
});

const chatWithAgentSchema = z.object({
  body: z.object({
    message: z
      .string()
      .min(1, "Message tidak boleh kosong")
      .max(2000, "Message terlalu panjang (max 2000 karakter)"),
  }),
});

const chatSessionIdSchema = z.object({
  params: z.object({
    sessionId: z.string().min(1, "Session ID tidak boleh kosong"),
  }),
});

// ==========================================
// ML API PAYLOAD VALIDATOR (Internal)
// ==========================================

const mlApiResponseSchema = z.object({
  "Machine ID": z.string(),
  Type: z.string(),
  "Air temperature [K]": z.string().or(z.number()),
  "Process temperature [K]": z.string().or(z.number()),
  "Rotational speed [rpm]": z.string().or(z.number()),
  "Torque [Nm]": z.string().or(z.number()),
  "Tool wear [min]": z.string().or(z.number()),
  "Predicted Failure Type": z.string(),
  "Forecast Failure Type": z.string().optional(),
  "Forecast Failure Timestamp": z.string().optional(),
  "Forecast Failure Countdown": z.string().or(z.number()).optional(),
});

// ==========================================
// TICKETS ENDPOINTS VALIDATORS
// ==========================================

const getTicketsSchema = z.object({
  query: z.object({
    limit: z
      .string()
      .optional()
      .refine(
        (val) => !val || !isNaN(parseInt(val)),
        "Limit harus berupa angka"
      ),
    offset: z
      .string()
      .optional()
      .refine(
        (val) => !val || !isNaN(parseInt(val)),
        "Offset harus berupa angka"
      ),
    machineId: z.string().optional(),
    status: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const s = val.toLowerCase();
          if (s === "opened" || s === "open" || s === "true" || s === "1")
            return true;
          if (s === "closed" || s === "false" || s === "0") return false;
        }
        return val;
      }, z.boolean())
      .optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  }),
});

const getTicketByIdSchema = z.object({
  params: z.object({
    ticketId: z
      .string()
      .refine(
        (val) => !isNaN(parseInt(val)) && parseInt(val) > 0,
        "Ticket ID harus berupa angka positif"
      ),
  }),
});

const updateTicketStatusSchema = z.object({
  params: z.object({
    ticketId: z
      .string()
      .refine(
        (val) => !isNaN(parseInt(val)) && parseInt(val) > 0,
        "Ticket ID harus berupa angka positif"
      ),
  }),
  body: z.object({
    status: z
      .preprocess((val) => {
        if (typeof val === "string") {
          const s = val.toLowerCase();
          if (s === "opened" || s === "open" || s === "true" || s === "1")
            return true;
          if (s === "closed" || s === "false" || s === "0") return false;
        }
        return val;
      }, z.boolean())
      .describe("New ticket status: true=opened, false=closed"),
  }),
});

module.exports = {
  postMachineSchema,
  postMachineByIdSchema,
  postPredictSchema,
  getMachineByIdSchema,
  getMachinesSchema,
  chatWithAgentSchema,
  chatSessionIdSchema,
  mlApiResponseSchema,
  getTicketsSchema,
  getTicketByIdSchema,
  updateTicketStatusSchema,
};
