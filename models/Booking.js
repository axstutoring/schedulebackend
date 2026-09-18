const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BookingSchema = new Schema({
  subject: String,
  class: String,
  tutor: String,       // tutor's name (display)
  tutorEmail: String,
  studentName: String,
  studentEmail: { type: String, required: true, lowercase: true, trim: true },
  date: String,         // display date, e.g. "Mon Apr 14"
  startTime: String,    // "9:00 AM"
  endTime: String,      // "10:00 AM"
  duration: Number,     // minutes
  location: String,
  topics: String,
}, { timestamps: true });

// Atomic backstop: MongoDB enforces this even if two requests for the exact
// same tutor/date/startTime land at the same instant — one will fail with a
// duplicate-key error, which the route below catches and reports cleanly.
BookingSchema.index({ tutorEmail: 1, date: 1, startTime: 1 }, { unique: true });

module.exports = mongoose.model('Booking', BookingSchema);
