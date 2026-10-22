const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
    {},
    {
        strict: false,
        timestamps: true,
        collection: 'categories',
    }
);

module.exports =
    mongoose.models.Category ||
    mongoose.model('Category', categorySchema);