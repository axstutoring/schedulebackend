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
  dateISO: String,       // "2026-04-14" — needed for reliable date-range queries, since `date` has no year
  startTime: String,    // "9:00 AM"
  endTime: String,      // "10:00 AM"
  duration: Number,     // minutes
  sessionType: { type: String, enum: ['in-person', 'online'], default: 'in-person' },
  location: String,     // in-person: the chosen location name; online: "Online (Zoom)"
  // true when `location` came from the tutor's preferredLocations list
  // (pre-approved by definition); false when the student typed a custom
  // "Other" location — the tutor sees it flagged on the pending session and
  // confirming the session doubles as approving that location.
  locationApproved: { type: Boolean, default: true },
  // Snapshot of the tutor's Zoom link at booking time (online sessions
  // only). Never sent to the student in the API response or in emails
  // until `confirmed` is true — see the booking routes.
  zoomLink: String,
  topics: String,
  // Optional single PDF the student attaches with the booking request
  // (e.g. a problem set) — stored inline as base64, matching this project's
  // "keep the database the same, no new infra" constraint.
  attachmentName: String,
  attachmentType: String,
  attachmentData: String, // base64
  // false until the tutor confirms the session; students see it as "pending"
  // until then.
  confirmed: { type: Boolean, default: false },
}, { timestamps: true });

// Atomic backstop: MongoDB enforces this even if two requests for the exact
// same tutor/date/startTime land at the same instant — one will fail with a
// duplicate-key error, which the route below catches and reports cleanly.
BookingSchema.index({ tutorEmail: 1, date: 1, startTime: 1 }, { unique: true });

module.exports = mongoose.model('Booking', BookingSchema);
