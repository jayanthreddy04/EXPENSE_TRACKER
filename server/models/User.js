import crypto from 'crypto';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },
    password: { type: String, select: false },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordSalt = crypto.randomBytes(16).toString('hex');
  this.passwordHash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, this.passwordSalt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
};

userSchema.methods.verifyPassword = async function verifyPassword(password) {
  if (!this.passwordHash || !this.passwordSalt) {
    return false;
  }

  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, this.passwordSalt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });

  const stored = Buffer.from(this.passwordHash, 'hex');
  const incoming = Buffer.from(hash, 'hex');

  return stored.length === incoming.length && crypto.timingSafeEqual(stored, incoming);
};

export default mongoose.model('User', userSchema);
