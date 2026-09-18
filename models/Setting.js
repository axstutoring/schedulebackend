const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SettingSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: Schema.Types.Mixed,
});

module.exports = mongoose.model('Setting', SettingSchema);
