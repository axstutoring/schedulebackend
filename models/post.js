const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PostSchema = new Schema ({
    member: {
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
    subject: {
        type: String,
        required: true
    },
    availability: {
        type: String,
        required: true
    },
    maximumHours: {
        type: Number,
        default: 0
    },
    off : {
        type: Array,
        required: true
    },
    booking: {
        type: String,
        default: ""
    },
    password: {
        type: String,
        required: true
    },
    authorization: {
        type: Number,
        default: 0
    }
});

const Post = mongoose.model("Post", PostSchema);

module.exports = Post;