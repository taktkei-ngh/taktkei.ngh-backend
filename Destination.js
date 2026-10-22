const mongoose = require('mongoose');

const destinationSchema = new mongoose.Schema(
    {},
    {
        strict: false,
        timestamps: true,
        collection: 'destinations',
    }
);

module.exports =
    mongoose.models.Destination ||
    mongoose.model('Destination', destinationSchema);