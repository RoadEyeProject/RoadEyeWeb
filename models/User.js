const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    reportCounts: {
        type: Map,
        of: Number,
        default: {
            "Police Car": 0,
            "Accident": 0,
            "Road Construction": 0
        }
    }
});

module.exports = mongoose.model('User', UserSchema);
