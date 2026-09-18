const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReviewSessionSchema = new Schema({
  className: String,  // comma-joined list of courses this session covers
  date: String,        // display date, e.g. "Tue, Apr 15"
  dateISO: String,      // "2026-04-15"
  time: String,          // "6:00 PM - 8:00 PM"
  location: String,
  // Each entry is { name, subject, email? } — kept as Mixed so legacy
  // plain-string RSVPs (from before subject-selection existed) still work.
  attendees: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('ReviewSession', ReviewSessionSchema);
