const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EmailSchema = new Schema ({
    email: {
        type: String,
        required: true
    },
    bookings: {
        type: String,
        default: ""
    },
});

const Email = mongoose.model("Email", EmailSchema);

module.exports = Email;