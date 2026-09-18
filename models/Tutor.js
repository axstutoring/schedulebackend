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
}, { timestamps: true });

module.exports = mongoose.model('Tutor', TutorSchema);
