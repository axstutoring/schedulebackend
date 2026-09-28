const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TimeRangeSchema = new Schema({
  startTime: String, // "09:00"
  endTime: String,   // "17:00"
}, { _id: false });

const TutorSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // bcrypt hash
  resetCodeHash: String,       // bcrypt hash of the current password-reset code, if one was requested
  resetCodeExpiresAt: Date,
  subjects: { type: [String], default: [] },       // broad categories, e.g. ["Chemistry"]
  classesITeach: { type: [String], default: [] },  // specific course codes, e.g. ["CHEM 101"]
  weeklyAvailability: {
    Sunday: { type: [TimeRangeSchema], default: [] },
    Monday: { type: [TimeRangeSchema], default: [] },
    Tuesday: { type: [TimeRangeSchema], default: [] },
    Wednesday: { type: [TimeRangeSchema], default: [] },
    Thursday: { type: [TimeRangeSchema], default: [] },
    Friday: { type: [TimeRangeSchema], default: [] },
    Saturday: { type: [TimeRangeSchema], default: [] },
  },
  unavailableDates: { type: [String], default: [] }, // ISO date strings, e.g. "2026-04-20"
  // In-person locations this tutor is willing to meet at. A mix of names
  // picked from the admin's master location list and the tutor's own
  // free-typed "Other" entries — stored flat, since a student picks from
  // this exact list when booking an in-person session with this tutor.
  preferredLocations: { type: [String], default: [] },
  // Must be the tutor's UCLA-account Zoom room link. Only revealed to a
  // student once the tutor confirms an online session (see booking routes).
  zoomLink: { type: String, default: '' },
  isAdmin: { type: Boolean, default: false },
  // Defaults true so admin-created tutors (POST /api/admin/tutors) are active
  // immediately; self-signup (POST /api/auth/tutor/signup) explicitly sets
  // this to false so new applicants wait for admin approval.
  isApproved: { type: Boolean, default: true },
  // Cumulative count of sessions this tutor has cancelled. At 3, onHold is
  // set automatically and they're removed from the public bookable list
  // until an admin clears it.
  cancelCount: { type: Number, default: 0 },
  onHold: { type: Boolean, default: false },
  // Who/what caused the current hold, so only the right party can release it:
  // 'self' — the tutor put themself on hold and can turn it back off anytime;
  // 'admin' — an admin held them manually; 'strikes' — the automatic
  // 3-cancellation hold. Only an admin can clear 'admin' or 'strikes' holds.
  holdReason: { type: String, enum: ['self', 'admin', 'strikes', null], default: null },
}, { timestamps: true });

module.exports = mongoose.model('Tutor', TutorSchema);
