const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        codeVoucher: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        discountValue: { type: Number, required: true, min: 0 },
        quantity: { type: Number, default: 0, min: 0 },
        userLimit: { type: Number, default: 0, min: 0 },
        minOrderValue: { type: Number, default: 0, min: 0 },
        maxDiscountAmount: { type: Number, default: 0, min: 0 },
        firstTimeUserOnly: { type: Boolean, default: false },
        status: {
            type: String,
            enum: ['ACTIVE', 'INACTIVE'],
            default: 'ACTIVE',
        },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        applyTo: {
            type: String,
            enum: ['ALL', 'TOUR', 'CATEGORY'],
            default: 'ALL',
        },
        tourId: { type: String, default: null },
        categoryId: { type: String, default: null },
        usedCount: { type: Number, default: 0 },
    },
    { timestamps: true, strict: true }
);

module.exports =
    mongoose.models.Voucher ||
    mongoose.model('Voucher', voucherSchema, 'vouchers');
