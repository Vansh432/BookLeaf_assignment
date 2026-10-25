import mongoose from 'mongoose';

// The worst-case cost of one AI call in flight. It is a lease: if the process dies before settling it
// (a crash, a deploy, a dev-server reload), it simply stops counting once it expires.
const reservationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    amountMicroUsd: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

// Running spend for one budget period, keyed "day:YYYY-MM-DD" or "month:YYYY-MM" (UTC).
// spentMicroUsd holds settled estimated costs; reservations hold calls in flight.
const aiBudgetSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    spentMicroUsd: { type: Number, default: 0 },
    reservations: { type: [reservationSchema], default: [] },
  },
  { versionKey: false, timestamps: { createdAt: false, updatedAt: true } },
);

const AiBudget = mongoose.model('AiBudget', aiBudgetSchema);

export default AiBudget;
