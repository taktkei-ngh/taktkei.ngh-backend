const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Tour = require('../models/Tour');
const Booking = require('../models/Booking');
const Voucher = require('../models/Voucher');

const router = express.Router();

const cleanCode = (value) =>
    String(value || '').trim().toUpperCase();

const serialize = (voucher) => {
    if (!voucher) return null;

    const value = voucher.toObject ? voucher.toObject() : voucher;

    return {
        ...value,
        id: String(value._id),
        _id: String(value._id),
    };
};

async function getUser(req) {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice(7).trim()
        : '';

    if (!token.startsWith('jwt-token-')) return null;

    const userId = token.slice('jwt-token-'.length);

    if (!mongoose.Types.ObjectId.isValid(userId)) return null;

    return User.findById(userId).select('_id email role').lean();
}

async function requireAdmin(req, res) {
    const user = await getUser(req);

    if (!user) {
        res.status(401).json({
            success: false,
            message: 'Vui lòng đăng nhập lại.',
        });
        return null;
    }

    if (String(user.role || '').toLowerCase() !== 'admin') {
        res.status(403).json({
            success: false,
            message: 'Bạn không có quyền quản lý voucher.',
        });
        return null;
    }

    return user;
}

function normalizeInput(body, partial = false) {
    const output = {};
    const fields = [
        'title',
        'codeVoucher',
        'discountValue',
        'quantity',
        'userLimit',
        'minOrderValue',
        'maxDiscountAmount',
        'firstTimeUserOnly',
        'status',
        'startDate',
        'endDate',
        'applyTo',
        'tourId',
        'categoryId',
    ];

    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(body, field)) continue;

        let value = body[field];

        if (field === 'codeVoucher') value = cleanCode(value);

        if (['title'].includes(field)) {
            value = String(value || '').trim();
        }

        if ([
            'discountValue',
            'quantity',
            'userLimit',
            'minOrderValue',
            'maxDiscountAmount',
        ].includes(field)) {
            value = Number(value);

            if (!Number.isFinite(value) || value < 0) {
                throw new Error('Giá trị số của voucher không hợp lệ.');
            }
        }

        if (['startDate', 'endDate'].includes(field)) {
            if (value === null || value === '') {
                value = null;
            } else {
                value = new Date(value);

                if (Number.isNaN(value.getTime())) {
                    throw new Error('Ngày voucher không hợp lệ.');
                }
            }
        }

        if (field === 'firstTimeUserOnly') {
            value = value === true || value === 'true';
        }

        if (field === 'status') {
            value = String(value).toUpperCase();

            if (!['ACTIVE', 'INACTIVE'].includes(value)) {
                throw new Error('Trạng thái voucher không hợp lệ.');
            }
        }

        if (field === 'applyTo') {
            value = String(value).toUpperCase();

            if (!['ALL', 'TOUR', 'CATEGORY'].includes(value)) {
                throw new Error('Đối tượng áp dụng voucher không hợp lệ.');
            }
        }

        if (['tourId', 'categoryId'].includes(field)) {
            value = value ? String(value) : null;
        }

        output[field] = value;
    }

    if (!partial) {
        if (!output.title || !output.codeVoucher) {
            throw new Error('Vui lòng nhập tên và mã voucher.');
        }

        if (output.discountValue === undefined ||
            output.discountValue <= 0 ||
            output.discountValue > 100) {
            throw new Error('discountValue phải lớn hơn 0 và không quá 100%.');
        }

        if ((output.applyTo === 'TOUR' && !output.tourId) ||
            (output.applyTo === 'CATEGORY' && !output.categoryId)) {
            throw new Error('Vui lòng chọn tour hoặc danh mục áp dụng.');
        }
    }

    return output;
}

async function resolveTour(tourId) {
    if (!tourId) return null;

    const TourDetail =
        mongoose.models.TourDetail ||
        mongoose.model(
            'TourDetail',
            new mongoose.Schema({}, { strict: false }),
            'tourdetails'
        );

    if (mongoose.Types.ObjectId.isValid(tourId)) {
        const detail = await TourDetail.findById(tourId).lean();

        if (detail && detail.tourId) {
            const realTourId = String(detail.tourId);
            const tour = await Tour.findById(realTourId).lean();

            return {
                tourId: realTourId,
                categoryId: String(
                    detail.categoryId ||
                    tour?.categoryId ||
                    tour?.category?._id ||
                    tour?.category ||
                    ''
                ),
            };
        }

        const tour = await Tour.findById(tourId).lean();

        if (tour) {
            return {
                tourId: String(tour._id),
                categoryId: String(
                    tour.categoryId ||
                    tour.category?._id ||
                    tour.category ||
                    ''
                ),
            };
        }
    }

    return null;
}

async function validateVoucher(req) {
    const code = cleanCode(req.query.codeVoucher);
    const orderValue = Number(req.query.orderValue || 0);
    const requestedTourId = String(req.query.tourId || '');

    const invalid = (message) => ({
        valid: false,
        message,
        discountAmount: 0,
    });

    if (!code) return invalid('Vui lòng nhập mã voucher.');

    if (!Number.isFinite(orderValue) || orderValue <= 0) {
        return invalid('Giá trị đơn hàng không hợp lệ.');
    }

    const voucher = await Voucher.findOne({
        codeVoucher: code,
    }).lean();

    if (!voucher || voucher.status !== 'ACTIVE') {
        return invalid('Voucher không tồn tại hoặc không còn hoạt động.');
    }

    const now = new Date();

    if (voucher.startDate && now < new Date(voucher.startDate)) {
        return invalid('Voucher chưa đến thời gian sử dụng.');
    }

    if (voucher.endDate && now > new Date(voucher.endDate)) {
        return invalid('Voucher đã hết hạn.');
    }

    if (orderValue < Number(voucher.minOrderValue || 0)) {
        return invalid('Đơn hàng chưa đạt giá trị tối thiểu.');
    }

    const redeemed = await Booking.countDocuments({
        voucherCode: code,
        paymentStatus: 'PAID',
    });

    if (Number(voucher.quantity) > 0 &&
        redeemed >= Number(voucher.quantity)) {
        return invalid('Voucher đã hết lượt sử dụng.');
    }

    if (voucher.applyTo === 'TOUR') {
        const selected = await resolveTour(requestedTourId);

        if (!selected || selected.tourId !== String(voucher.tourId)) {
            return invalid('Voucher không áp dụng cho tour này.');
        }
    }

    if (voucher.applyTo === 'CATEGORY') {
        const selected = await resolveTour(requestedTourId);

        if (!selected ||
            selected.categoryId !== String(voucher.categoryId)) {
            return invalid('Voucher không áp dụng cho danh mục này.');
        }
    }

    const user = await getUser(req);

    if (voucher.firstTimeUserOnly) {
        if (!user) {
            return invalid('Vui lòng đăng nhập để sử dụng voucher này.');
        }

        const previousBooking = await Booking.exists({
            bookerEmail: user.email,
            paymentStatus: 'PAID',
        });

        if (previousBooking) {
            return invalid('Voucher chỉ dành cho khách hàng lần đầu.');
        }
    }

    if (Number(voucher.userLimit) > 0 && user) {
        const userUsage = await Booking.countDocuments({
            bookerEmail: user.email,
            voucherCode: code,
            paymentStatus: 'PAID',
        });

        if (userUsage >= Number(voucher.userLimit)) {
            return invalid('Bạn đã sử dụng voucher đủ số lần cho phép.');
        }
    }

    let discountAmount = Math.round(
        orderValue * Number(voucher.discountValue) / 100
    );

    if (Number(voucher.maxDiscountAmount) > 0) {
        discountAmount = Math.min(
            discountAmount,
            Number(voucher.maxDiscountAmount)
        );
    }

    discountAmount = Math.min(orderValue, Math.max(0, discountAmount));

    return {
        valid: true,
        message: 'Áp dụng voucher thành công.',
        discountAmount,
        voucher: serialize(voucher),
    };
}

// GET /api/admin/voucher/all
router.get('/all', async (req, res) => {
    try {
        const user = await getUser(req);
        const filter =
            user && String(user.role || '').toLowerCase() === 'admin'
                ? {}
                : { status: 'ACTIVE' };

        const vouchers = await Voucher.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            data: vouchers.map(serialize),
        });
    } catch (error) {
        console.error('Get vouchers error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải danh sách voucher.',
        });
    }
});

// POST /all/ids
router.post('/all/ids', async (req, res) => {
    try {
        const ids = Array.isArray(req.body)
            ? req.body
            : req.body?.ids || [];

        if (!Array.isArray(ids)) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách ID không hợp lệ.',
            });
        }

        const validIds = ids.filter((id) =>
            mongoose.Types.ObjectId.isValid(id)
        );

        const vouchers = await Voucher.find({
            _id: { $in: validIds },
            status: 'ACTIVE',
        }).lean();

        return res.json({
            success: true,
            data: vouchers.map(serialize),
        });
    } catch (error) {
        console.error('Get vouchers by IDs error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải voucher.',
        });
    }
});

// GET /by-code và /codeVoucher
async function getByCode(req, res) {
    try {
        const code = cleanCode(req.query.codeVoucher);
        const voucher = await Voucher.findOne({
            codeVoucher: code,
        }).lean();

        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy voucher.',
            });
        }

        return res.json({
            success: true,
            data: serialize(voucher),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Không thể tải voucher.',
        });
    }
}

router.get('/by-code', getByCode);
router.get('/codeVoucher', getByCode);

router.get('/check-voucher', async (req, res) => {
    try {
        const result = await validateVoucher(req);

        // Frontend đang kiểm tra checkResponse.data.valid.
        return res.json({ data: result });
    } catch (error) {
        console.error('Check voucher error:', error.message);

        return res.status(500).json({
            data: {
                valid: false,
                message: 'Không thể kiểm tra voucher.',
                discountAmount: 0,
            },
        });
    }
});

// GET /:id
router.get('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'ID voucher không hợp lệ.',
            });
        }

        const voucher = await Voucher.findById(req.params.id).lean();

        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy voucher.',
            });
        }

        return res.json({
            success: true,
            data: serialize(voucher),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Không thể tải voucher.',
        });
    }
});

// POST /create
router.post('/create', async (req, res) => {
    try {
        if (!await requireAdmin(req, res)) return;

        const input = normalizeInput(req.body);

        if (input.startDate && input.endDate &&
            input.startDate > input.endDate) {
            return res.status(400).json({
                success: false,
                message: 'Ngày bắt đầu phải trước ngày kết thúc.',
            });
        }

        const exists = await Voucher.exists({
            codeVoucher: input.codeVoucher,
        });

        if (exists) {
            return res.status(409).json({
                success: false,
                message: 'Mã voucher đã tồn tại.',
            });
        }

        const voucher = await Voucher.create(input);

        return res.status(201).json({
            success: true,
            data: serialize(voucher),
        });
    } catch (error) {
        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.message || 'Không thể tạo voucher.',
        });
    }
});

// PUT /update/:id
router.put('/update/:id', async (req, res) => {
    try {
        if (!await requireAdmin(req, res)) return;

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'ID voucher không hợp lệ.',
            });
        }

        const input = normalizeInput(req.body, true);

        if (input.startDate && input.endDate &&
            input.startDate > input.endDate) {
            return res.status(400).json({
                success: false,
                message: 'Ngày bắt đầu phải trước ngày kết thúc.',
            });
        }

        if (input.codeVoucher) {
            const duplicate = await Voucher.exists({
                codeVoucher: input.codeVoucher,
                _id: { $ne: req.params.id },
            });

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: 'Mã voucher đã được sử dụng.',
                });
            }
        }

        const voucher = await Voucher.findByIdAndUpdate(
            req.params.id,
            { $set: input },
            { new: true, runValidators: true }
        );

        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy voucher.',
            });
        }

        return res.json({
            success: true,
            data: serialize(voucher),
        });
    } catch (error) {
        return res.status(error.code === 11000 ? 409 : 400).json({
            success: false,
            message: error.message || 'Không thể cập nhật voucher.',
        });
    }
});

// PATCH /updateStatus/:id
router.patch('/updateStatus/:id', async (req, res) => {
    try {
        if (!await requireAdmin(req, res)) return;

        const status = String(req.query.status || '').toUpperCase();

        if (!['ACTIVE', 'INACTIVE'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái không hợp lệ.',
            });
        }

        const voucher = await Voucher.findByIdAndUpdate(
            req.params.id,
            { $set: { status } },
            { new: true, runValidators: true }
        );

        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy voucher.',
            });
        }

        return res.json({
            success: true,
            data: serialize(voucher),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Không thể cập nhật trạng thái voucher.',
        });
    }
});

// DELETE /delete/:id: soft delete
router.delete('/delete/:id', async (req, res) => {
    try {
        if (!await requireAdmin(req, res)) return;

        const voucher = await Voucher.findByIdAndUpdate(
            req.params.id,
            { $set: { status: 'INACTIVE' } },
            { new: true }
        );

        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy voucher.',
            });
        }

        return res.json({ success: true, data: serialize(voucher) });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Không thể tắt voucher.',
        });
    }
});

// DELETE /delete-force/:id: hard delete
router.delete('/delete-force/:id', async (req, res) => {
    try {
        if (!await requireAdmin(req, res)) return;

        const voucher = await Voucher.findByIdAndDelete(req.params.id);

        if (!voucher) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy voucher.',
            });
        }

        return res.json({ success: true, data: serialize(voucher) });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Không thể xóa voucher.',
        });
    }
});

module.exports = router;
