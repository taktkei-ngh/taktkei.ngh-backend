const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        tourId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tour',
            required: true,
        },
    },
    { timestamps: true }
);

wishlistSchema.index({ userId: 1, tourId: 1 }, { unique: true });

module.exports =
    mongoose.models.Wishlist ||
    mongoose.model('Wishlist', wishlistSchema, 'wishlists');
