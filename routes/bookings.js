const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Tour = require('../models/Tour');
const Booking = require('../models/Booking');

const router = express.Router();

const TourDetail =
    mongoose.models.TourDetail ||
    mongoose.model(
        'TourDetail',
        new mongoose.Schema(
            {},
            {
                strict: false,
                timestamps: true,
            }
        ),
        'tourdetails'
    );

const getTourId = (detail) => {
    const value =
        detail?.tourId ??
        detail?.tour_id ??
        detail?.tour?._id ??
        detail?.tour?.id ??
        detail?.tour;

    if (value && typeof value === 'object') {
        return String(value._id ?? value.id ?? '');
    }

    return value ? String(value) : '';
};

const buildVnpQuery = (params) =>
    Object.keys(params)
        .sort()
        .map(
            (key) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(
                    String(params[key])
                ).replace(/%20/g, '+')}`
        )
        .join('&');

const formatVnpDate = (date) => {
    const vnDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const pad = (value) => String(value).padStart(2, '0');

    return (
        vnDate.getUTCFullYear() +
        pad(vnDate.getUTCMonth() + 1) +
        pad(vnDate.getUTCDate()) +
        pad(vnDate.getUTCHours()) +
        pad(vnDate.getUTCMinutes()) +
        pad(vnDate.getUTCSeconds())
    );
};

const isClosedStatus = (status) =>
    [
        'CLOSED',
        'CANCELLED',
        'CANCELED',
        'INACTIVE',
        'DELETED',
        'FULL',
        'SOLD_OUT',
    ].includes(String(status || '').toUpperCase());

/* POST /api/bookings/tour/:id */
router.post('/tour/:id', async (req, res) => {
    try {
        const detailId = req.params.id;
        const body = req.body || {};

        if (!mongoose.Types.ObjectId.isValid(detailId)) {
            return res.status(400).json({
                success: false,
                message: 'ID lịch khởi hành không hợp lệ.',
            });
        }

        const detail = await TourDetail.findById(detailId).lean();

        if (!detail) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy lịch khởi hành.',
            });
        }

        if (isClosedStatus(detail.status)) {
            return res.status(400).json({
                success: false,
                message: 'Lịch khởi hành đã đóng.',
            });
        }

        const attendees = Array.isArray(body.bookingDetails)
            ? body.bookingDetails
            : [];

        if (attendees.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập thông tin người tham gia.',
            });
        }

        const totalAmount = Number(body.totalAmount);

        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Tổng tiền không hợp lệ.',
            });
        }

        const tourId = getTourId(detail);
        let tour = null;

        if (mongoose.Types.ObjectId.isValid(tourId)) {
            tour = await Tour.findById(tourId).lean();
        }

        const bookingNo =
            `ROAM-${Date.now()}-` +
            crypto.randomBytes(3).toString('hex').toUpperCase();

        const booking = await Booking.create({
            bookingNo,
            tourDetailId: detail._id,
            tourId,
            tourTitle:
                tour?.title ||
                detail.title ||
                detail.name ||
                'Tour du lịch',

            bookerFullName: String(body.bookerFullName || ''),
            bookerEmail: String(body.bookerEmail || ''),
            bookerPhoneNumber: String(body.bookerPhoneNumber || ''),
            bookerAddress: String(body.bookerAddress || ''),

            bookingDetails: attendees,
            paymentMethod: 'MOMO',
            paymentStatus: 'PENDING',
            status: 'PENDING_PAYMENT',
            totalAmount,

            voucherCode: body.voucherCode || null,
            specialRequests: String(body.specialRequests || ''),
        });

        return res.status(201).json({
            success: true,
            message: 'Đã tạo booking, đang chờ thanh toán.',
            data: {
                _id: booking._id,
                id: booking._id,
                bookingNo: booking.bookingNo,
                totalAmount: booking.totalAmount,
                status: booking.status,
                paymentStatus: booking.paymentStatus,
                tourTitle: booking.tourTitle,
                tourDetailId: booking.tourDetailId,
            },
        });
    } catch (error) {
        console.error('Lỗi tạo booking:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tạo booking.',
        });
    }
});

/* MoMo: tao chu ky cho yeu cau thanh toan */
const createMoMoRequestSignature = (data, accessKey, secretKey) => {
    const raw = [
        `accessKey=${accessKey}`,
        `amount=${data.amount}`,
        `extraData=${data.extraData}`,
        `ipnUrl=${data.ipnUrl}`,
        `orderId=${data.orderId}`,
        `orderInfo=${data.orderInfo}`,
        `partnerCode=${data.partnerCode}`,
        `redirectUrl=${data.redirectUrl}`,
        `requestId=${data.requestId}`,
        `requestType=${data.requestType}`,
    ].join('&');

    return crypto
        .createHmac('sha256', secretKey)
        .update(raw, 'utf8')
        .digest('hex');
};

/* Xac minh chu ky ket qua MoMo */
const verifyMoMoResultSignature = (payload) => {
    const accessKey = process.env.MOMO_ACCESS_KEY;
    const secretKey = process.env.MOMO_SECRET_KEY;

    if (!accessKey || !secretKey || !payload.signature) {
        return false;
    }

    const raw = [
        `accessKey=${accessKey}`,
        `amount=${payload.amount ?? ''}`,
        `extraData=${payload.extraData ?? ''}`,
        `message=${payload.message ?? ''}`,
        `orderId=${payload.orderId ?? ''}`,
        `orderInfo=${payload.orderInfo ?? ''}`,
        `orderType=${payload.orderType ?? ''}`,
        `partnerCode=${payload.partnerCode ?? ''}`,
        `payType=${payload.payType ?? ''}`,
        `requestId=${payload.requestId ?? ''}`,
        `responseTime=${payload.responseTime ?? ''}`,
        `resultCode=${payload.resultCode ?? ''}`,
        `transId=${payload.transId ?? ''}`,
    ].join('&');

    const expected = crypto
        .createHmac('sha256', secretKey)
        .update(raw, 'utf8')
        .digest('hex');

    const actual = String(payload.signature).toLowerCase();

    if (actual.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(actual, 'utf8'),
        Buffer.from(expected, 'utf8')
    );
};

/* Dung chung cho redirect va IPN */
const processMoMoResult = async (payload) => {
    const partnerCode = process.env.MOMO_PARTNER_CODE;

    if (!partnerCode || !process.env.MOMO_ACCESS_KEY ||
        !process.env.MOMO_SECRET_KEY) {
        const error = new Error('Chua cau hinh thong tin MoMo.');
        error.statusCode = 503;
        throw error;
    }

    if (String(payload.partnerCode || '') !== partnerCode ||
        !verifyMoMoResultSignature(payload)) {
        const error = new Error('Chu ky hoac Partner Code MoMo khong hop le.');
        error.statusCode = 400;
        throw error;
    }

    const orderId = String(payload.orderId || '');
    const booking = await Booking.findOne({ momoOrderId: orderId });

    if (!booking) {
        const error = new Error('Khong tim thay booking MoMo.');
        error.statusCode = 404;
        throw error;
    }

    if (Number(payload.amount) !== Number(booking.totalAmount)) {
        const error = new Error('So tien MoMo khong khop booking.');
        error.statusCode = 400;
        throw error;
    }

    const paid = Number(payload.resultCode) === 0;

    booking.paymentMethod = 'MOMO';

    if (paid) {
        booking.paymentStatus = 'PAID';
        booking.status = 'CONFIRMED';
    } else if (booking.paymentStatus !== 'PAID') {
        booking.paymentStatus = 'FAILED';
        booking.status = 'PAYMENT_FAILED';
    }

    await booking.save();

    return {
        paid,
        bookingNo: booking.bookingNo,
        paymentStatus: booking.paymentStatus,
        status: booking.status,
        message: String(payload.message || ''),
    };
};

/* GET /api/bookings/checkout */
router.get('/checkout', async (req, res) => {
    try {
        const bookingNo = String(
            req.query.orderInfo || req.query.bookingNo || ''
        ).trim();

        if (!bookingNo) {
            return res.status(400).json({
                success: false,
                message: 'Thieu ma booking.',
            });
        }

        const booking = await Booking.findOne({ bookingNo });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Khong tim thay booking can thanh toan.',
            });
        }

        if (booking.paymentStatus === 'PAID') {
            return res.status(409).json({
                success: false,
                message: 'Booking nay da duoc thanh toan.',
            });
        }

        const partnerCode = process.env.MOMO_PARTNER_CODE;
        const accessKey = process.env.MOMO_ACCESS_KEY;
        const secretKey = process.env.MOMO_SECRET_KEY;
        const ipnUrl = process.env.MOMO_IPN_URL;
        const redirectUrl =
            process.env.MOMO_REDIRECT_URL ||
            'http://localhost:5000/api/bookings/momo-return';

        if (!partnerCode || !accessKey || !secretKey || !ipnUrl) {
            return res.status(503).json({
                success: false,
                message: 'Chua cau hinh day du thong tin MoMo trong .env.',
            });
        }

        const amount = Number(booking.totalAmount);

        if (!Number.isSafeInteger(amount) || amount < 1000) {
            return res.status(400).json({
                success: false,
                message: 'So tien thanh toan khong hop le.',
            });
        }

        const orderId =
            `ROAM${Date.now()}${crypto.randomBytes(6).toString('hex')}`;
        const requestId =
            `REQ${Date.now()}${crypto.randomBytes(4).toString('hex')}`;

        const extraData = Buffer.from(
            JSON.stringify({ bookingNo: booking.bookingNo }),
            'utf8'
        ).toString('base64');

        const paymentRequest = {
            partnerCode,
            partnerName: process.env.MOMO_PARTNER_NAME || 'ROAM',
            storeId: process.env.MOMO_STORE_ID || 'ROAM',
            requestId,
            amount,
            orderId,
            orderInfo: `Thanh toan booking ${booking.bookingNo}`,
            redirectUrl,
            ipnUrl,
            lang: 'vi',
            requestType: 'captureWallet',
            extraData,
            autoCapture: true,
        };

        paymentRequest.signature = createMoMoRequestSignature(
            paymentRequest,
            accessKey,
            secretKey
        );

        booking.paymentMethod = 'MOMO';
        booking.momoOrderId = orderId;
        await booking.save();

        const endpoint =
            process.env.MOMO_ENDPOINT ||
            'https://test-payment.momo.vn/v2/gateway/api/create';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify(paymentRequest),
            signal: AbortSignal.timeout(30000),
        });

        const momoResult = await response.json();

        if (!response.ok ||
            Number(momoResult.resultCode) !== 0 ||
            !momoResult.payUrl) {
            console.error('MoMo tao giao dich that bai:', {
                resultCode: momoResult.resultCode,
                message: momoResult.message,
            });

            return res.status(502).json({
                success: false,
                message:
                    momoResult.message ||
                    'MoMo chua tao duoc URL thanh toan.',
                resultCode: momoResult.resultCode,
            });
        }

        // Frontend hien tai nhan mot chuoi URL de chuyen trang.
        return res.status(200).json(momoResult.payUrl);
    } catch (error) {
        console.error('Loi tao URL thanh toan MoMo:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Khong the tao URL thanh toan MoMo.',
        });
    }
});

/* POST /api/bookings/momo-ipn: MoMo thong bao server-to-server */
router.post('/momo-ipn', async (req, res) => {
    try {
        await processMoMoResult(req.body || {});

        // MoMo yeu cau HTTP 204 khi da xu ly IPN thanh cong.
        return res.status(204).end();
    } catch (error) {
        console.error('Loi xu ly IPN MoMo:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Khong the xu ly IPN MoMo.',
        });
    }
});

/* GET /api/bookings/momo-return: trinh duyet tro ve tu MoMo */
router.get('/momo-return', async (req, res) => {
    try {
        const result = await processMoMoResult(req.query);

        return res.status(200).json({
            success: result.paid,
            message: result.paid
                ? 'Thanh toan MoMo thanh cong.'
                : 'Giao dich MoMo khong thanh cong.',
            data: result,
        });
    } catch (error) {
        console.error('Loi redirect MoMo:', error.message);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Khong the xac minh ket qua MoMo.',
        });
    }
});

module.exports = router;