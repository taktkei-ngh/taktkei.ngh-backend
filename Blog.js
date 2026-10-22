const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema(
    {},
    {
        strict: false,
        timestamps: true,
        collection: 'blogs',
    }
);

module.exports =
    mongoose.models.Blog ||
    mongoose.model('Blog', blogSchema);