const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema(
    {
        title: { type: String, required: true },
        description: { type: String },
        price: { type: Number, default: 0 },
        location: { type: String },
        duration: { type: String },
        image: { type: String },
        rating: { type: Number, default: 5 },
        availableSeats: { type: Number, default: 20 }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Tour', tourSchema);