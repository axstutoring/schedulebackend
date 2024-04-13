const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CourseSchema = new Schema ({
    course: {
        type: String,
        required: true
    },
    subjectDivision: {
        type: Array,
        required: true
    },
});

const Course = mongoose.model("Course", CourseSchema);

module.exports = Course;