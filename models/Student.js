const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StudentSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // bcrypt hash
  resetCodeHash: String,       // bcrypt hash of the current password-reset code, if one was requested
  resetCodeExpiresAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Student', StudentSchema);
