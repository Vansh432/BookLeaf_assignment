import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    sequence: { type: Number, default: 0 },
  },
  { versionKey: false },
);

// Atomic increment, so concurrent requests never receive the same number.
counterSchema.statics.next = async function next(name) {
  const counter = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { sequence: 1 } },
    { returnDocument: 'after', upsert: true, lean: true },
  );
  return counter.sequence;
};

const Counter = mongoose.model('Counter', counterSchema);

export default Counter;
