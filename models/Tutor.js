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
}, { timestamps: true });

module.exports = mongoose.model('Tutor', TutorSchema);
