import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { ROLES } from '../../config/constants.js';

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email is invalid'],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true, index: true },
    // Author profile fields; empty for admins.
    authorCode: { type: String, trim: true },
    phone: { type: String, trim: true },
    city: { type: String, trim: true },
    joinedDate: { type: Date },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    // Only a hash of the current refresh token is stored, so a leaked database cannot mint sessions.
    refreshTokenHash: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.refreshTokenHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index(
  { authorCode: 1 },
  { unique: true, partialFilterExpression: { authorCode: { $type: 'string' } } },
);

userSchema.pre('save', async function hashPassword() {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
