const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StudentSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // bcrypt hash
  resetCodeHash: String,       // bcrypt hash of the current password-reset code, if one was requested
  resetCodeExpiresAt: Date,
  // Cumulative count of sessions this student has cancelled. At 3, onHold
  // is set automatically and they can no longer book new sessions until an
  // admin clears it.
  cancelCount: { type: Number, default: 0 },
  onHold: { type: Boolean, default: false },
  // Who/what caused the current hold, so only the right party can release it:
  // 'admin' — an admin put them on hold manually; 'strikes' — the automatic
  // 3-cancellation hold. Students can't self-hold, so there's no 'self' here.
  // Only an admin can clear either kind.
  holdReason: { type: String, enum: ['admin', 'strikes', null], default: null },
}, { timestamps: true });

module.exports = mongoose.model('Student', StudentSchema);
