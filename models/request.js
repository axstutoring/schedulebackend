const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RequestSchema = new Schema ({
    student: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        default: ""
    },
    request: {
        type: String,
        default: ""
    },
    tutor: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true
    },
    timestamp: {
        type: String,
        required: true
    },
});

const Request = mongoose.model("Request", RequestSchema);

module.exports = Request;