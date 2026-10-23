const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        username: { type: String, default: '', trim: true },
        firstName: { type: String, default: '' },
        lastName: { type: String, default: '' },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        phone: { type: String, default: '' },
        address: { type: String, default: '' },
        gender: { type: String, default: '' },
        birthday: { type: Date, default: null },
        avatar: { type: String, default: '' },
        role: { type: String, default: 'user' }
    },
    { timestamps: true }
);

module.exports =
    mongoose.models.User ||
    mongoose.model('User', userSchema);