const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Deliberately schemaless: a single document shaped like
// { Chemistry: ["CHEM 101", ...], Biology: [...], ... }
// so subjects/classes are fully admin-editable, not hardcoded.
const ClassesSchema = new Schema({}, { strict: false });

module.exports = mongoose.model('Classes', ClassesSchema);
