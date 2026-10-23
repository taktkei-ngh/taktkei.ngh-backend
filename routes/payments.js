const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');

const router = express.Router();

router.get('/all', async (req, res) => {
    try {
        const authorization = req.headers.authorization || '';
        const token = authorization.startsWith('Bearer ')
            ? authorization.slice(7).trim()
            : '';

        if (!token.startsWith('jwt-token-')) {
            return res.status(401).json({
                success: false,
                message: 'Vui lòng đăng nhập để xem lịch sử thanh toán.',
            });
        }

        const userId = token.slice('jwt-token-'.length);

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                success: false,
                message: 'Token không hợp lệ.',
            });
        }

        const user = await User.findById(userId)
            .select('email')
            .lean();

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Không tìm thấy tài khoản.',
            });
        }

        const bookings = await Booking.find({
            bookerEmail: user.email,
        })
            .select(
                'bookingNo tourTitle totalAmount paymentMethod paymentStatus status createdAt updatedAt'
            )
            .sort({ createdAt: -1 })
            .lean();

        const data = bookings.map((booking) => ({
            ...booking,
            id: String(booking._id),
            _id: String(booking._id),
        }));

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Lỗi lấy lịch sử thanh toán:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải lịch sử thanh toán.',
        });
    }
});

module.exports = router;
