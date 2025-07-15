const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    imagePath: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Image', imageSchema);