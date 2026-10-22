const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            required: true,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        location: {
            type: String,
            required: true,
            trim: true,
        },

        duration: {
            type: String,
            required: true,
        },

        image: {
            type: String,
            required: true,
        },

        rating: {
            type: Number,
            default: 5,
            min: 0,
            max: 5,
        },

        availableSeats: {
            type: Number,
            default: 20,
            min: 0,
        },

        status: {
            type: String,
            enum: ['DRAFT', 'PUBLISHED', 'HIDDEN'],
            default: 'PUBLISHED',
        },

        region: {
            type: String,
            enum: ['INSIDE', 'OUTSIDE'],
            default: 'INSIDE',
        },

        categoryId: {
            type: String,
            default: null,
        },

        startDate: {
            type: Date,
            default: null,
        },

        endDate: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Tour', tourSchema);