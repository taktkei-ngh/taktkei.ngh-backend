const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Tour = require('../models/Tour');
const Wishlist = require('../models/Wishlist');

const router = express.Router();

async function getUser(req) {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice(7).trim()
        : '';

    if (!token.startsWith('jwt-token-')) return null;

    const userId = token.slice('jwt-token-'.length);

    if (!mongoose.Types.ObjectId.isValid(userId)) return null;

    return User.findById(userId).select('_id email').lean();
}

function serializeWishlist(item) {
    const tour = item.tourId;

    return {
        id: String(item._id),
        _id: String(item._id),
        tourId: String(tour._id),
        title: tour.title || '',
        description: tour.description || '',
        thumbnail: tour.thumbnail || tour.image || '',
        duration: tour.duration || 0,
        maxPrice: Number(tour.maxPrice ?? tour.price ?? 0),
    };
}

// GET /api/wishlist/all
router.get('/all', async (req, res) => {
    try {
        const user = await getUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Vui lòng đăng nhập lại.',
            });
        }

        const items = await Wishlist.find({ userId: user._id })
            .populate('tourId')
            .sort({ createdAt: -1 })
            .lean();

        const data = items
            .filter((item) => item.tourId)
            .map(serializeWishlist);

        return res.json({ success: true, data });
    } catch (error) {
        console.error('Wishlist GET error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải danh sách yêu thích.',
        });
    }
});

// POST /api/wishlist/add/:id
router.post('/add/:id', async (req, res) => {
    try {
        const user = await getUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Vui lòng đăng nhập lại.',
            });
        }

        const tourId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(tourId)) {
            return res.status(400).json({
                success: false,
                message: 'ID tour không hợp lệ.',
            });
        }

        const tour = await Tour.findById(tourId).select('_id').lean();

        if (!tour) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy tour.',
            });
        }

        let item = await Wishlist.findOne({
            userId: user._id,
            tourId: tour._id,
        });

        if (!item) {
            try {
                item = await Wishlist.create({
                    userId: user._id,
                    tourId: tour._id,
                });
            } catch (error) {
                if (error.code !== 11000) throw error;

                item = await Wishlist.findOne({
                    userId: user._id,
                    tourId: tour._id,
                });
            }
        }

        const savedItem = await Wishlist.findById(item._id)
            .populate('tourId')
            .lean();

        return res.status(200).json({
            success: true,
            message: 'Đã thêm tour vào danh sách yêu thích.',
            data: serializeWishlist(savedItem),
        });
    } catch (error) {
        console.error('Wishlist POST error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Không thể thêm tour yêu thích.',
        });
    }
});

// DELETE /api/wishlist/delete/:id
router.delete('/delete/:id', async (req, res) => {
    try {
        const user = await getUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Vui lòng đăng nhập lại.',
            });
        }

        const wishlistId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(wishlistId)) {
            return res.status(400).json({
                success: false,
                message: 'ID wishlist không hợp lệ.',
            });
        }

        const deleted = await Wishlist.findOneAndDelete({
            _id: wishlistId,
            userId: user._id,
        });

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy mục yêu thích.',
            });
        }

        return res.json({
            success: true,
            message: 'Đã xóa tour khỏi danh sách yêu thích.',
        });
    } catch (error) {
        console.error('Wishlist DELETE error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Không thể xóa tour yêu thích.',
        });
    }
});

module.exports = router;
