const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

dotenv.config();

const User = require('./models/User');
const Tour = require('./models/Tour');

// CÃƒÂ¡c model bÃ¡Â»â€¢ sung cho API category, blog vÃƒÂ  destination.
// TÃƒÂªn collection phÃ¡ÂºÂ£i khÃ¡Â»â€ºp vÃ¡Â»â€ºi MongoDB Compass.
const looseSchemaOptions = {
    strict: false,
    timestamps: true,
};

const Category =
    mongoose.models.Category ||
    mongoose.model(
        'Category',
        new mongoose.Schema({}, looseSchemaOptions),
        'categories'
    );

const Blog =
    mongoose.models.Blog ||
    mongoose.model(
        'Blog',
        new mongoose.Schema({}, looseSchemaOptions),
        'blogs'
    );

const BlogCategory =
    mongoose.models.BlogCategory ||
    mongoose.model(
        'BlogCategory',
        new mongoose.Schema({}, looseSchemaOptions),
        'blogcategories'
    );

const Destination =
    mongoose.models.Destination ||
    mongoose.model(
        'Destination',
        new mongoose.Schema({}, looseSchemaOptions),
        'destinations'
    );
const tourDetailSchema = new mongoose.Schema(
    {
        tourId: { type: mongoose.Schema.Types.Mixed, index: true },
        tour: { type: mongoose.Schema.Types.Mixed },
        tour_id: { type: mongoose.Schema.Types.Mixed },

        title: { type: String, default: '' },
        date: { type: Date },
        startDate: { type: Date },
        departureDate: { type: Date },
        tourDate: { type: Date },
        endDate: { type: Date },

        status: { type: String, default: 'AVAILABLE' },
        priceAdults: { type: Number, default: 0 },
        priceChildren: { type: Number, default: 0 },
        quantity: { type: Number, default: 0 },
        availableSeats: { type: Number, default: 0 }
    },
    {
        strict: false,
        timestamps: true
    }
);

const TourDetail =
    mongoose.models.TourDetail ||
    mongoose.model('TourDetail', tourDetailSchema, 'tourdetails');



const bookingRoutes = require('./routes/bookings');
const voucherRoutes = require('./routes/vouchers');
const wishlistRoutes = require('./routes/wishlist');
const paymentRoutes = require('./routes/payments');

const app = express();

// ======================================================
// 1. MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(
        `[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`
    );
    next();
});

// ======================================================
// 2. CONFIGURATION
// ======================================================

const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 5000;

const isValidDate = (value) => {
    if (
        value === undefined ||
        value === null ||
        value === '' ||
        value === 'null' ||
        value === 'undefined'
    ) {
        return false;
    }

    return !Number.isNaN(new Date(value).getTime());
};

const isMissing = (value) =>
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'null' ||
    value === 'undefined';

const isValidObjectId = (id) =>
    mongoose.Types.ObjectId.isValid(id);

const getTokenFromRequest = (req) => {
    const authorization = req.headers.authorization || '';

    if (authorization.startsWith('Bearer ')) {
        return authorization.slice(7).trim();
    }

    return String(
        req.query.token || req.body?.token || ''
    ).trim();
};

const publicUser = (user) => ({
    id: user._id,
    _id: user._id,
    name: user.name || user.username || '',
    username: user.username || user.name || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    phone: user.phone || '',
    address: user.address || '',
    gender: user.gender || '',
    birthday: user.birthday || null,
    avatar: user.avatar || '',
    role: user.role || 'USER',
});


// ======================================================
// 3. HEALTH CHECK
// ======================================================

app.post('/api/users/update-profile', async (req, res) => {
    try {
        const token = getTokenFromRequest(req);

        if (!token.startsWith('jwt-token-')) {
            return res.status(401).json({
                success: false,
                message: 'Vui long dang nhap lai.',
            });
        }

        const userId = token.slice('jwt-token-'.length);

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                success: false,
                message: 'Token khong hop le.',
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Khong tim thay tai khoan.',
            });
        }

        const body = req.body || {};
        const payload =
            body.data && typeof body.data === 'object'
                ? { ...body, ...body.data }
                : body;

        const has = (key) =>
            Object.prototype.hasOwnProperty.call(payload, key);

        let changed = false;

        if (has('username')) {
            const value = String(payload.username || '').trim();

            if (!value) {
                return res.status(400).json({
                    success: false,
                    message: 'Username khong duoc de trong.',
                });
            }

            user.username = value;
            changed = true;
        }

        if (has('firstName')) {
            user.firstName = String(payload.firstName || '').trim();
            changed = true;
        }

        if (has('lastName')) {
            user.lastName = String(payload.lastName || '').trim();
            changed = true;
        }

        if (has('firstName') || has('lastName') || has('fullName')) {
            const fullName = has('fullName')
                ? String(payload.fullName || '').trim()
                : [user.firstName, user.lastName]
                    .filter(Boolean)
                    .join(' ')
                    .trim();

            if (fullName) {
                user.name = fullName;
            } else if (!user.name) {
                user.name = user.username || 'User';
            }

            changed = true;
        }

        if (has('email')) {
            const email = String(payload.email || '').trim().toLowerCase();

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Email khong hop le.',
                });
            }

            const duplicate = await User.findOne({
                email,
                _id: { $ne: user._id },
            }).lean();

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: 'Email da duoc tai khoan khac su dung.',
                });
            }

            user.email = email;
            changed = true;
        }

        if (has('phone')) {
            user.phone = String(payload.phone || '').trim();
            changed = true;
        }

        if (has('address')) {
            user.address = String(payload.address || '').trim();
            changed = true;
        }

        if (has('gender')) {
            user.gender = String(payload.gender || '').trim();
            changed = true;
        }

        if (has('birthday')) {
            const birthday = String(payload.birthday || '').trim();

            if (!birthday) {
                user.birthday = null;
            } else {
                const parsedDate = new Date(birthday);

                if (Number.isNaN(parsedDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: 'Ngay sinh khong hop le.',
                    });
                }

                user.birthday = parsedDate;
            }

            changed = true;
        }

        if (!changed) {
            return res.status(400).json({
                success: false,
                message: 'Khong co thong tin nao can cap nhat.',
            });
        }

        await user.save();

        const safeUser = publicUser(user);

        return res.status(200).json({
            success: true,
            message: 'Cap nhat thong tin thanh cong.',
            data: safeUser,
            user: safeUser,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Email da duoc su dung.',
            });
        }

        console.error('Update profile error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Khong the cap nhat thong tin.',
        });
    }
});

app.get('/', (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'ROAM Backend API Ä‘ang hoáº¡t Ä‘á»™ng.',
        port: PORT,
        database:
            mongoose.connection.readyState === 1
                ? 'connected'
                : 'disconnected',
    });
});

app.get('/api/health', (req, res) => {
    return res.status(200).json({
        success: true,
        server: 'running',
        database:
            mongoose.connection.readyState === 1
                ? 'connected'
                : 'disconnected',
    });
});

// ======================================================
// 4. SEED TOUR SAMPLE
// KhÃƒÂ´ng xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u tour cÃ…Â©.
// ======================================================

app.get('/api/seed-tours', async (req, res) => {
    try {
        const sampleTours = [
            {
                title: 'Du Lá»‹ch ÄÃ  Náºµng - Há»™i An - BÃ  NÃ  Hills',
                description:
                    'KhÃ¡m phÃ¡ ÄÃ  Náºµng, Cáº§u VÃ ng vÃ  Phá»‘ cá»• Há»™i An lung linh vá» Ä‘Ãªm.',
                price: 3500000,
                location: 'ÄÃ  Náºµng',
                duration: '3 NgÃ y 2 ÄÃªm',
                image:
                    'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=500',
                rating: 4.8,
                availableSeats: 15,
                status: 'PUBLISHED',
                region: 'INSIDE',
            },
            {
                title: 'KhÃ¡m PhÃ¡ Äáº£o Ngá»c PhÃº Quá»‘c',
                description:
                    'Tráº£i nghiá»‡m biá»ƒn xanh, cÃ¡t tráº¯ng vÃ  ngáº¯m hoÃ ng hÃ´n PhÃº Quá»‘c.',
                price: 5200000,
                location: 'PhÃº Quá»‘c',
                duration: '4 NgÃ y 3 ÄÃªm',
                image:
                    'https://images.unsplash.com/photo-1540202404-a2f29016b523?w=500',
                rating: 4.9,
                availableSeats: 10,
                status: 'PUBLISHED',
                region: 'INSIDE',
            },
            {
                title: 'Sapa - Chinh Phá»¥c Äá»‰nh Fansipan',
                description:
                    'SÄƒn mÃ¢y Fansipan, táº­n hÆ°á»Ÿng khÃ´ng khÃ­ trong lÃ nh vÃ¹ng TÃ¢y Báº¯c.',
                price: 2800000,
                location: 'Sapa',
                duration: '2 NgÃ y 1 ÄÃªm',
                image:
                    'https://images.unsplash.com/photo-1528127269322-539801943592?w=500',
                rating: 4.7,
                availableSeats: 20,
                status: 'PUBLISHED',
                region: 'INSIDE',
            },
        ];

        let insertedCount = 0;

        for (const tour of sampleTours) {
            const result = await Tour.updateOne(
                { title: tour.title },
                { $setOnInsert: tour },
                { upsert: true }
            );

            if (result.upsertedCount > 0) {
                insertedCount += 1;
            }
        }

        return res.status(200).json({
            success: true,
            message: `HoÃƒÂ n tÃ¡ÂºÂ¥t kiÃ¡Â»Æ’m tra dÃ¡Â»Â¯ liÃ¡Â»â€¡u tour mÃ¡ÂºÂ«u. Ã„ÂÃƒÂ£ thÃƒÂªm ${insertedCount} tour mÃ¡Â»â€ºi.`,
            insertedCount,
            totalSamples: sampleTours.length,
        });
    } catch (error) {
        console.error('Lá»—i khá»Ÿi táº¡o tour máº«u:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ khá»Ÿi táº¡o dá»¯ liá»‡u tour máº«u.',
        });
    }
});

// ======================================================
// 5. AUTHENTICATION
// ======================================================

// Ã„ÂÃ„Æ’ng kÃƒÂ½
app.post('/api/auth/register', async (req, res) => {
    const {
        email,
        password,
        name,
        fullName,
        username,
        phone,
    } = req.body;

    if (!password || (!email && !username && !phone)) {
        return res.status(400).json({
            success: false,
            message: 'Vui lÃ²ng cung cáº¥p Ä‘áº§y Ä‘á»§ thÃ´ng tin.',
        });
    }

    const userEmail = String(email || username || phone)
        .trim()
        .toLowerCase();

    const displayName =
        name ||
        fullName ||
        username ||
        userEmail.split('@')[0];

    try {
        const existingUser = await User.findOne({
            email: userEmail,
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'TÃ i khoáº£n Ä‘Ã£ tá»“n táº¡i.',
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: displayName,
            email: userEmail,
            password: hashedPassword,
            phone: phone || '',
        });

        await newUser.save();

        // Token prototype Ã„â€˜Ã¡Â»Æ’ tÃ†Â°Ã†Â¡ng thÃƒÂ­ch frontend hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i.
        // KhÃƒÂ´ng phÃ¡ÂºÂ£i JWT bÃ¡ÂºÂ£o mÃ¡ÂºÂ­t dÃƒÂ nh cho production.
        const token = `jwt-token-${newUser._id}`;

        return res.status(201).json({
            success: true,
            message: 'ÄÄƒng kÃ½ thÃ nh cÃ´ng.',
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
            },
        });
    } catch (error) {
        console.error('Lá»—i Ä‘Äƒng kÃ½:', error);

        return res.status(500).json({
            success: false,
            message: 'Lá»—i mÃ¡y chá»§ khi Ä‘Äƒng kÃ½.',
        });
    }
});

// Ã„ÂÃ„Æ’ng nhÃ¡ÂºÂ­p
app.post('/api/auth/login', async (req, res) => {
    const {
        email,
        username,
        identifier,
        password,
    } = req.body;

    const loginIdentifier = String(
        identifier || email || username || ''
    ).trim();

    if (!loginIdentifier || !password) {
        return res.status(400).json({
            success: false,
            message: 'Vui lÃ²ng nháº­p tÃ i khoáº£n vÃ  máº­t kháº©u.',
        });
    }

    try {
        const user = await User.findOne({
            $or: [
                { email: loginIdentifier.toLowerCase() },
                { name: loginIdentifier },
                { username: loginIdentifier },
            ],
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'TÃ i khoáº£n hoáº·c máº­t kháº©u khÃ´ng Ä‘Ãºng.',
            });
        }

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'TÃ i khoáº£n hoáº·c máº­t kháº©u khÃ´ng Ä‘Ãºng.',
            });
        }

        const token = `jwt-token-${user._id}`;

        return res.status(200).json({
            success: true,
            message: 'ÄÄƒng nháº­p thÃ nh cÃ´ng.',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (error) {
        console.error('Lá»—i Ä‘Äƒng nháº­p:', error);

        return res.status(500).json({
            success: false,
            message: 'Lá»—i mÃ¡y chá»§ khi Ä‘Äƒng nháº­p.',
        });
    }
});

// XÃƒÂ¡c thÃ¡Â»Â±c token prototype cho frontend.
// LÃ†Â°u ÃƒÂ½: cÃ¡ÂºÂ§n thay bÃ¡ÂºÂ±ng JWT/session thÃ¡ÂºÂ­t trÃ†Â°Ã¡Â»â€ºc khi triÃ¡Â»Æ’n khai production.
app.get('/api/auth/authenticate-token', async (req, res) => {
    try {
        const token = getTokenFromRequest(req);

        if (!token.startsWith('jwt-token-')) {
            return res.status(401).json({
                success: false,
                authenticated: false,
                message: 'Token khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.',
            });
        }

        const userId = token.slice('jwt-token-'.length);

        if (!isValidObjectId(userId)) {
            return res.status(401).json({
                success: false,
                authenticated: false,
                message: 'Token khÃ´ng há»£p lá»‡.',
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                authenticated: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n.',
            });
        }

        const safeUser = publicUser(user);

        return res.status(200).json({
            success: true,
            authenticated: true,
            user: safeUser,
            data: {
                user: safeUser,
            },
        });
    } catch (error) {
        console.error('Lá»—i xÃ¡c thá»±c token:', error);

        return res.status(500).json({
            success: false,
            authenticated: false,
            message: 'KhÃ´ng thá»ƒ xÃ¡c thá»±c token.',
        });
    }
});

// ======================================================
// 6. TOUR API
// Khai bÃƒÂ¡o /all trÃ†Â°Ã¡Â»â€ºc /:id Ã„â€˜Ã¡Â»Æ’ trÃƒÂ¡nh nhÃ¡ÂºÂ§m "all" lÃƒÂ  ID.
// ======================================================

const getAllTours = async (req, res) => {
    try {
        const {
            title,
            minPrice,
            maxPrice,
            categoryId,
            startDate,
            endDate,
            region,
            status,
        } = req.query;

        const filter = {};

        if (!isMissing(title)) {
            filter.title = {
                $regex: String(title),
                $options: 'i',
            };
        }

        if (!isMissing(minPrice)) {
            const price = Number(minPrice);

            if (!Number.isFinite(price)) {
                return res.status(400).json({
                    success: false,
                    message: 'GiÃ¡ tá»‘i thiá»ƒu khÃ´ng há»£p lá»‡.',
                });
            }

            filter.price = {
                ...filter.price,
                $gte: price,
            };
        }

        if (!isMissing(maxPrice)) {
            const price = Number(maxPrice);

            if (!Number.isFinite(price)) {
                return res.status(400).json({
                    success: false,
                    message: 'GiÃ¡ tá»‘i Ä‘a khÃ´ng há»£p lá»‡.',
                });
            }

            filter.price = {
                ...filter.price,
                $lte: price,
            };
        }

        if (!isMissing(categoryId)) {
            filter.categoryId = String(categoryId);
        }

        if (region === 'INSIDE' || region === 'OUTSIDE') {
            filter.region = region;
        }

        if (
            !isMissing(status) &&
            ['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(status)
        ) {
            filter.status = status;
        }

        if (isValidDate(startDate) && isValidDate(endDate)) {
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (start > end) {
                return res.status(400).json({
                    success: false,
                    message: 'NgÃ y báº¯t Ä‘áº§u pháº£i trÆ°á»›c ngÃ y káº¿t thÃºc.',
                });
            }

            filter.startDate = { $lte: end };
            filter.endDate = { $gte: start };
        } else if (isValidDate(startDate)) {
            filter.endDate = {
                $gte: new Date(startDate),
            };
        } else if (isValidDate(endDate)) {
            filter.startDate = {
                $lte: new Date(endDate),
            };
        }

        const tours = await Tour.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: tours,
            total: tours.length,
        });
    } catch (error) {
        console.error('Lá»—i táº£i danh sÃ¡ch tour:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº£i danh sÃ¡ch tour.',
        });
    }
};

app.get('/api/tours/all', getAllTours);
app.get('/api/tours', getAllTours);

// LÃ¡ÂºÂ¥y chi tiÃ¡ÂºÂ¿t tour theo ID
app.get('/api/tours/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID tour khÃ´ng há»£p lá»‡.',
            });
        }

        const tour = await Tour.findById(id);

        if (!tour) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y tour.',
            });
        }

        return res.status(200).json({
            success: true,
            data: tour,
        });
    } catch (error) {
        console.error('Lá»—i láº¥y chi tiáº¿t tour:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ láº¥y thÃ´ng tin tour.',
        });
    }
});

// ======================================================
// 7. CATEGORY API
// ======================================================

app.get('/api/categories/all', async (req, res) => {
    try {
        const categories = await Category.find()
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: categories,
            total: categories.length,
        });
    } catch (error) {
        console.error('Lá»—i táº£i danh má»¥c:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº£i danh má»¥c.',
        });
    }
});

app.post('/api/categories/create', async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Dá»¯ liá»‡u danh má»¥c khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.',
            });
        }

        const category = await Category.create(req.body);

        return res.status(201).json({
            success: true,
            data: category,
        });
    } catch (error) {
        console.error('Lá»—i táº¡o danh má»¥c:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº¡o danh má»¥c.',
        });
    }
});

app.put('/api/categories/update/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID danh má»¥c khÃ´ng há»£p lá»‡.',
            });
        }

        const category = await Category.findByIdAndUpdate(
            id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y danh má»¥c.',
            });
        }

        return res.status(200).json({
            success: true,
            data: category,
        });
    } catch (error) {
        console.error('Lá»—i cáº­p nháº­t danh má»¥c:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ cáº­p nháº­t danh má»¥c.',
        });
    }
});

app.delete('/api/categories/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID danh má»¥c khÃ´ng há»£p lá»‡.',
            });
        }

        const category = await Category.findByIdAndDelete(id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y danh má»¥c.',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'ÄÃ£ xÃ³a danh má»¥c.',
        });
    } catch (error) {
        console.error('Lá»—i xÃ³a danh má»¥c:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ xÃ³a danh má»¥c.',
        });
    }
});

// ======================================================
// 8. BLOG API
// ======================================================

app.get('/api/admin/blog/all', async (req, res) => {
    try {
        const blogs = await Blog.find()
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: blogs,
            total: blogs.length,
        });
    } catch (error) {
        console.error('Lá»—i táº£i danh sÃ¡ch bÃ i viáº¿t:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº£i danh sÃ¡ch bÃ i viáº¿t.',
        });
    }
});

app.get('/api/admin/blog/category/all', async (req, res) => {
    try {
        const categories = await BlogCategory.find()
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: categories,
            total: categories.length,
        });
    } catch (error) {
        console.error('Lá»—i táº£i danh má»¥c bÃ i viáº¿t:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº£i danh má»¥c bÃ i viáº¿t.',
        });
    }
});

app.get('/api/admin/blog/slug', async (req, res) => {
    try {
        const slug = req.query.slug;

        if (isMissing(slug)) {
            return res.status(400).json({
                success: false,
                message: 'Thiáº¿u slug bÃ i viáº¿t.',
            });
        }

        const blog = await Blog.findOne({
            slug: String(slug),
        }).lean();

        if (!blog) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y bÃ i viáº¿t.',
            });
        }

        return res.status(200).json({
            success: true,
            data: blog,
        });
    } catch (error) {
        console.error('Lá»—i táº£i bÃ i viáº¿t theo slug:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº£i bÃ i viáº¿t.',
        });
    }
});

// ======================================================
// 9. DESTINATION API
// Khai bÃƒÂ¡o route cÃ¡Â»Â¥ thÃ¡Â»Æ’ trÃ†Â°Ã¡Â»â€ºc route cÃƒÂ³ tham sÃ¡Â»â€˜.
// ======================================================

app.get('/api/destinations/top-destinations', async (req, res) => {
    try {
        const destinations = await Destination.find()
            .sort({ views: -1, createdAt: -1 })
            .limit(8)
            .lean();

        return res.status(200).json({
            success: true,
            data: destinations,
            total: destinations.length,
        });
    } catch (error) {
        console.error('Lá»—i táº£i Ä‘iá»ƒm Ä‘áº¿n ná»•i báº­t:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº£i Ä‘iá»ƒm Ä‘áº¿n ná»•i báº­t.',
        });
    }
});

app.get('/api/destinations/all', async (req, res) => {
    try {
        const destinations = await Destination.find()
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: destinations,
            total: destinations.length,
        });
    } catch (error) {
        console.error('Lá»—i táº£i danh sÃ¡ch Ä‘iá»ƒm Ä‘áº¿n:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº£i danh sÃ¡ch Ä‘iá»ƒm Ä‘áº¿n.',
        });
    }
});

app.get('/api/destinations/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID Ä‘iá»ƒm Ä‘áº¿n khÃ´ng há»£p lá»‡.',
            });
        }

        const destination = await Destination.findById(id).lean();

        if (!destination) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y Ä‘iá»ƒm Ä‘áº¿n.',
            });
        }

        return res.status(200).json({
            success: true,
            data: destination,
        });
    } catch (error) {
        console.error('Lá»—i táº£i Ä‘iá»ƒm Ä‘áº¿n:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº£i Ä‘iá»ƒm Ä‘áº¿n.',
        });
    }
});

app.post('/api/destinations/create', async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Dá»¯ liá»‡u Ä‘iá»ƒm Ä‘áº¿n khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.',
            });
        }

        const destination = await Destination.create(req.body);

        return res.status(201).json({
            success: true,
            data: destination,
        });
    } catch (error) {
        console.error('Lá»—i táº¡o Ä‘iá»ƒm Ä‘áº¿n:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº¡o Ä‘iá»ƒm Ä‘áº¿n.',
        });
    }
});

app.put('/api/destinations/update/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID Ä‘iá»ƒm Ä‘áº¿n khÃ´ng há»£p lá»‡.',
            });
        }

        const destination = await Destination.findByIdAndUpdate(
            id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!destination) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y Ä‘iá»ƒm Ä‘áº¿n.',
            });
        }

        return res.status(200).json({
            success: true,
            data: destination,
        });
    } catch (error) {
        console.error('Lá»—i cáº­p nháº­t Ä‘iá»ƒm Ä‘áº¿n:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ cáº­p nháº­t Ä‘iá»ƒm Ä‘áº¿n.',
        });
    }
});

app.delete('/api/destinations/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID Ä‘iá»ƒm Ä‘áº¿n khÃ´ng há»£p lá»‡.',
            });
        }

        const destination = await Destination.findByIdAndDelete(id);

        if (!destination) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y Ä‘iá»ƒm Ä‘áº¿n.',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'ÄÃ£ xÃ³a Ä‘iá»ƒm Ä‘áº¿n.',
        });
    } catch (error) {
        console.error('Lá»—i xÃ³a Ä‘iá»ƒm Ä‘áº¿n:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ xÃ³a Ä‘iá»ƒm Ä‘áº¿n.',
        });
    }
});

// ======================================================

/* ======================================================
   TOUR DETAILS / LÃ¡Â»Å CH KHÃ¡Â»Å¾I HÃƒâ‚¬NH
   Ã„ÂÃ¡ÂºÂ·t phÃ¡ÂºÂ§n nÃƒÂ y TRÃ†Â¯Ã¡Â»Å¡C app.use('/api', fallback)
====================================================== */

const getTourDetailTourFilter = (tourId) => {
    const id = String(tourId || '').trim();
    const values = [id];

    if (mongoose.Types.ObjectId.isValid(id)) {
        values.push(new mongoose.Types.ObjectId(id));
    }

    return {
        $or: [
            { tourId: { $in: values } },
            { tour: { $in: values } },
            { tour_id: { $in: values } },
            { 'tour._id': { $in: values } },
            { 'tour.id': { $in: values } }
        ]
    };
};

const getTourDetailDate = (item) => {
    const value =
        item.startDate ||
        item.departureDate ||
        item.date ||
        item.tourDate;

    if (!value) return null;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const isTourDetailAvailable = (item) => {
    const status = String(item.status || 'AVAILABLE').toUpperCase();

    return ![
        'CANCELLED',
        'CANCELED',
        'INACTIVE',
        'DELETED'
    ].includes(status);
};

// GET /api/tour-details/all
app.get('/api/tour-details/all', async (req, res) => {
    try {
        const data = await TourDetail.find()
            .sort({ startDate: 1, date: 1, createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data,
            total: data.length
        });
    } catch (error) {
        console.error('Lá»—i láº¥y danh sÃ¡ch lá»‹ch tour:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ láº¥y danh sÃ¡ch lá»‹ch tour.'
        });
    }
});

// GET /api/tour-details/tour/:tourId
app.get('/api/tour-details/tour/:tourId', async (req, res) => {
    try {
        const { tourId } = req.params;

        if (!tourId) {
            return res.status(400).json({
                success: false,
                message: 'Thiáº¿u tourId.'
            });
        }

        const data = await TourDetail.find(
            getTourDetailTourFilter(tourId)
        )
            .sort({ startDate: 1, date: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            data,
            total: data.length
        });
    } catch (error) {
        console.error('Lá»—i láº¥y lá»‹ch theo tour:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ láº¥y lá»‹ch theo tour.'
        });
    }
});

// GET /api/tour-details/month/:id
// TrÃ¡ÂºÂ£ vÃ¡Â»Â cÃƒÂ¡c thÃƒÂ¡ng vÃƒÂ  ngÃƒÂ y khÃ¡Â»Å¸i hÃƒÂ nh hiÃ¡Â»â€¡n cÃƒÂ³ cÃ¡Â»Â§a mÃ¡Â»â„¢t tour.
app.get('/api/tour-details/month/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const records = await TourDetail.find(
            getTourDetailTourFilter(id)
        ).lean();

        const grouped = new Map();

        records.forEach((item) => {
            if (!isTourDetailAvailable(item)) return;

            const date = getTourDetailDate(item);
            if (!date) return;

            const month = [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, '0')
            ].join('-');

            const dateString = [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, '0'),
                String(date.getDate()).padStart(2, '0')
            ].join('-');

            if (!grouped.has(month)) {
                grouped.set(month, new Set());
            }

            grouped.get(month).add(dateString);
        });

        const data = Array.from(grouped.entries())
            .map(([month, dateSet]) => ({
                month,
                dates: Array.from(dateSet).sort()
            }))
            .sort((a, b) => a.month.localeCompare(b.month));

        const availableDates = data.flatMap((item) => item.dates);

        return res.status(200).json({
            success: true,
            data,
            months: data,
            availableDates,
            total: data.length
        });
    } catch (error) {
        console.error('Lá»—i láº¥y lá»‹ch theo thÃ¡ng:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ láº¥y lá»‹ch theo thÃ¡ng.'
        });
    }
});

// GET /api/tour-details/day?tourId=...&months=YYYY-MM
app.get('/api/tour-details/day', async (req, res) => {
    try {
        const { tourId } = req.query;
        const monthValue = String(
            req.query.months || req.query.month || ''
        ).trim();

        if (!tourId) {
            return res.status(400).json({
                success: false,
                message: 'Thiáº¿u tourId.'
            });
        }

        let year = null;
        let month = null;

        // HÃ¡Â»â€” trÃ¡Â»Â£ Ã„â€˜Ã¡Â»â€¹nh dÃ¡ÂºÂ¡ng YYYY-MM.
        const match = monthValue.match(/^(\d{4})-(\d{1,2})$/);

        if (match) {
            year = Number(match[1]);
            month = Number(match[2]);

            if (month < 1 || month > 12) {
                return res.status(400).json({
                    success: false,
                    message: 'ThÃ¡ng khÃ´ng há»£p lá»‡. DÃ¹ng Ä‘á»‹nh dáº¡ng YYYY-MM.'
                });
            }
        }

        const records = await TourDetail.find(
            getTourDetailTourFilter(tourId)
        ).lean();

        const data = records
            .filter((item) => {
                if (!isTourDetailAvailable(item)) return false;

                const date = getTourDetailDate(item);
                if (!date) return false;

                if (year !== null && month !== null) {
                    return (
                        date.getFullYear() === year &&
                        date.getMonth() + 1 === month
                    );
                }

                return true;
            })
            .sort((a, b) => {
                const dateA = getTourDetailDate(a);
                const dateB = getTourDetailDate(b);

                return (dateA?.getTime() || 0) -
                    (dateB?.getTime() || 0);
            });

        return res.status(200).json({
            success: true,
            data,
            total: data.length
        });
    } catch (error) {
        console.error('Lá»—i láº¥y lá»‹ch theo ngÃ y:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ láº¥y lá»‹ch theo ngÃ y.'
        });
    }
});

// GET /api/tour-details/:id
// Ã„ÂÃ¡ÂºÂ·t route nÃƒÂ y sau /all, /tour, /month vÃƒÂ  /day.
app.get('/api/tour-details/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID lá»‹ch tour khÃ´ng há»£p lá»‡.'
            });
        }

        const data = await TourDetail.findById(id).lean();

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y lá»‹ch tour.'
            });
        }

        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Lá»—i láº¥y chi tiáº¿t lá»‹ch tour:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ láº¥y chi tiáº¿t lá»‹ch tour.'
        });
    }
});

// POST /api/tour-details/add
app.post('/api/tour-details/add', async (req, res) => {
    try {
        const body = req.body || {};
        const rawTourId = body.tourId || body.tour_id || body.tour;
        const tourId =
            rawTourId && typeof rawTourId === 'object'
                ? (rawTourId._id || rawTourId.id)
                : rawTourId;

        if (!tourId || !mongoose.Types.ObjectId.isValid(String(tourId))) {
            return res.status(400).json({
                success: false,
                message: 'Cáº§n cung cáº¥p tourId há»£p lá»‡.'
            });
        }

        const tourExists = await Tour.findById(String(tourId)).lean();

        if (!tourExists) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y tour tÆ°Æ¡ng á»©ng.'
            });
        }

        const newDetail = new TourDetail({
            ...body,
            tourId: String(tourId),
            status: body.status || 'AVAILABLE'
        });

        const saved = await newDetail.save();

        return res.status(201).json({
            success: true,
            message: 'ÄÃ£ táº¡o lá»‹ch tour.',
            data: saved
        });
    } catch (error) {
        console.error('Lá»—i táº¡o lá»‹ch tour:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ táº¡o lá»‹ch tour.'
        });
    }
});

// POST /api/tour-details/update/:id
app.post('/api/tour-details/update/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID lá»‹ch tour khÃ´ng há»£p lá»‡.'
            });
        }

        const body = { ...(req.body || {}) };
        delete body._id;
        delete body.__v;
        delete body.createdAt;

        const data = await TourDetail.findByIdAndUpdate(
            id,
            { $set: body },
            { new: true, runValidators: true }
        );

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y lá»‹ch tour Ä‘á»ƒ cáº­p nháº­t.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'ÄÃ£ cáº­p nháº­t lá»‹ch tour.',
            data
        });
    } catch (error) {
        console.error('Lá»—i cáº­p nháº­t lá»‹ch tour:', error);

        return res.status(500).json({
            success: false,
            message: 'KhÃ´ng thá»ƒ cáº­p nháº­t lá»‹ch tour.'
        });
    }
});
// ======================================================
// 11. KHÃ¡Â»Å¾I Ã„ÂÃ¡Â»ËœNG SERVER SAU KHI KÃ¡ÂºÂ¾T NÃ¡Â»ÂI MONGODB
// ======================================================

app.use('/api/bookings', bookingRoutes);

app.use('/api/payments', paymentRoutes);

app.use('/api/wishlist', wishlistRoutes);

app.use('/api/admin/voucher', voucherRoutes);

const startServer = async () => {
    try {
        if (!MONGO_URI) {
            throw new Error(
                'Thiáº¿u MONGO_URI. HÃ£y kiá»ƒm tra file .env trong pacific-backend.'
            );
        }

        await mongoose.connect(MONGO_URI);

        console.log('âœ… ÄÃ£ káº¿t ná»‘i thÃ nh cÃ´ng tá»›i Database MongoDB!');

        // BÃ¡Â»â€¢ sung trÃ†Â°Ã¡Â»Âng mÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh cho tour cÃ…Â© nÃ¡ÂºÂ¿u Ã„â€˜ang thiÃ¡ÂºÂ¿u.
        await Tour.updateMany(
            { status: { $exists: false } },
            { $set: { status: 'PUBLISHED' } }
        );

        await Tour.updateMany(
            { region: { $exists: false } },
            { $set: { region: 'INSIDE' } }
        );

        console.log('âœ… ÄÃ£ kiá»ƒm tra trÆ°á»ng status vÃ  region cá»§a tour.');

        app.listen(PORT, () => {
            console.log(
                `Ã°Å¸Å¡â‚¬ ROAM Backend Ã„â€˜ang chÃ¡ÂºÂ¡y tÃ¡ÂºÂ¡i http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error(
            'âŒ KhÃ´ng thá»ƒ khá»Ÿi Ä‘á»™ng backend:',
            error.message
        );

        process.exit(1);
    }
};

startServer();





