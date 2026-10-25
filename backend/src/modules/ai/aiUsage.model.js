import mongoose from 'mongoose';
import { AI_CALL_STATUSES, AI_OPERATIONS } from '../../config/constants.js';
import { AI_ERROR_CODES } from './ai.errors.js';

// One row per logical AI call (retries included), so spend, latency and failure rates can be
// aggregated. Costs are estimates from configured prices, stored in integer micro-USD to avoid
// floating-point drift. No prompt or response text is stored.
const aiUsageSchema = new mongoose.Schema(
  {
    operation: { type: String, enum: Object.values(AI_OPERATIONS), required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    status: { type: String, enum: Object.values(AI_CALL_STATUSES), required: true },
    failureReason: { type: String, enum: [...Object.values(AI_ERROR_CODES), null], default: null },
    attempts: { type: Number, min: 0, default: 0 },
    inputTokens: { type: Number, min: 0, default: 0 },
    outputTokens: { type: Number, min: 0, default: 0 },
    cachedTokens: { type: Number, min: 0, default: 0 },
    // True when the provider reported no token counts and they were estimated from text length.
    tokensEstimated: { type: Boolean, default: false },
    costMicroUsd: { type: Number, min: 0, default: 0 },
    // End-to-end time, including queuedMs spent waiting for a request slot under AI_REQUESTS_PER_MINUTE.
    latencyMs: { type: Number, min: 0, required: true },
    queuedMs: { type: Number, min: 0, default: 0 },
    correlationId: { type: String, required: true },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

// Usage reports filter by time window; per-ticket cost looks up by ticket.
aiUsageSchema.index({ createdAt: -1, operation: 1 });
aiUsageSchema.index({ ticket: 1, createdAt: -1 }, { partialFilterExpression: { ticket: { $type: 'objectId' } } });

const AiUsage = mongoose.model('AiUsage', aiUsageSchema);

export default AiUsage;
