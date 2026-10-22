const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

dotenv.config();

const User = require('./models/User');
const Tour = require('./models/Tour');

// Các model bổ sung cho API category, blog và destination.
// Tên collection phải khớp với MongoDB Compass.
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
    email: user.email || '',
    phone: user.phone || '',
    role: user.role || 'USER',
});

// ======================================================
// 3. HEALTH CHECK
// ======================================================

app.get('/', (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'ROAM Backend API đang hoạt động.',
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
// Không xóa dữ liệu tour cũ.
// ======================================================

app.get('/api/seed-tours', async (req, res) => {
    try {
        const sampleTours = [
            {
                title: 'Du Lịch Đà Nẵng - Hội An - Bà Nà Hills',
                description:
                    'Khám phá Đà Nẵng, Cầu Vàng và Phố cổ Hội An lung linh về đêm.',
                price: 3500000,
                location: 'Đà Nẵng',
                duration: '3 Ngày 2 Đêm',
                image:
                    'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=500',
                rating: 4.8,
                availableSeats: 15,
                status: 'PUBLISHED',
                region: 'INSIDE',
            },
            {
                title: 'Khám Phá Đảo Ngọc Phú Quốc',
                description:
                    'Trải nghiệm biển xanh, cát trắng và ngắm hoàng hôn Phú Quốc.',
                price: 5200000,
                location: 'Phú Quốc',
                duration: '4 Ngày 3 Đêm',
                image:
                    'https://images.unsplash.com/photo-1540202404-a2f29016b523?w=500',
                rating: 4.9,
                availableSeats: 10,
                status: 'PUBLISHED',
                region: 'INSIDE',
            },
            {
                title: 'Sapa - Chinh Phục Đỉnh Fansipan',
                description:
                    'Săn mây Fansipan, tận hưởng không khí trong lành vùng Tây Bắc.',
                price: 2800000,
                location: 'Sapa',
                duration: '2 Ngày 1 Đêm',
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
            message: `Hoàn tất kiểm tra dữ liệu tour mẫu. Đã thêm ${insertedCount} tour mới.`,
            insertedCount,
            totalSamples: sampleTours.length,
        });
    } catch (error) {
        console.error('Lỗi khởi tạo tour mẫu:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể khởi tạo dữ liệu tour mẫu.',
        });
    }
});

// ======================================================
// 5. AUTHENTICATION
// ======================================================

// Đăng ký
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
            message: 'Vui lòng cung cấp đầy đủ thông tin.',
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
                message: 'Tài khoản đã tồn tại.',
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

        // Token prototype để tương thích frontend hiện tại.
        // Không phải JWT bảo mật dành cho production.
        const token = `jwt-token-${newUser._id}`;

        return res.status(201).json({
            success: true,
            message: 'Đăng ký thành công.',
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
            },
        });
    } catch (error) {
        console.error('Lỗi đăng ký:', error);

        return res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ khi đăng ký.',
        });
    }
});

// Đăng nhập
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
            message: 'Vui lòng nhập tài khoản và mật khẩu.',
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
                message: 'Tài khoản hoặc mật khẩu không đúng.',
            });
        }

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Tài khoản hoặc mật khẩu không đúng.',
            });
        }

        const token = `jwt-token-${user._id}`;

        return res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công.',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (error) {
        console.error('Lỗi đăng nhập:', error);

        return res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ khi đăng nhập.',
        });
    }
});

// Xác thực token prototype cho frontend.
// Lưu ý: cần thay bằng JWT/session thật trước khi triển khai production.
app.get('/api/auth/authenticate-token', async (req, res) => {
    try {
        const token = getTokenFromRequest(req);

        if (!token.startsWith('jwt-token-')) {
            return res.status(401).json({
                success: false,
                authenticated: false,
                message: 'Token không hợp lệ hoặc đã hết hạn.',
            });
        }

        const userId = token.slice('jwt-token-'.length);

        if (!isValidObjectId(userId)) {
            return res.status(401).json({
                success: false,
                authenticated: false,
                message: 'Token không hợp lệ.',
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                authenticated: false,
                message: 'Không tìm thấy tài khoản.',
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
        console.error('Lỗi xác thực token:', error);

        return res.status(500).json({
            success: false,
            authenticated: false,
            message: 'Không thể xác thực token.',
        });
    }
});

// ======================================================
// 6. TOUR API
// Khai báo /all trước /:id để tránh nhầm "all" là ID.
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
                    message: 'Giá tối thiểu không hợp lệ.',
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
                    message: 'Giá tối đa không hợp lệ.',
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
                    message: 'Ngày bắt đầu phải trước ngày kết thúc.',
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
        console.error('Lỗi tải danh sách tour:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải danh sách tour.',
        });
    }
};

app.get('/api/tours/all', getAllTours);
app.get('/api/tours', getAllTours);

// Lấy chi tiết tour theo ID
app.get('/api/tours/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID tour không hợp lệ.',
            });
        }

        const tour = await Tour.findById(id);

        if (!tour) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy tour.',
            });
        }

        return res.status(200).json({
            success: true,
            data: tour,
        });
    } catch (error) {
        console.error('Lỗi lấy chi tiết tour:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể lấy thông tin tour.',
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
        console.error('Lỗi tải danh mục:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải danh mục.',
        });
    }
});

app.post('/api/categories/create', async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu danh mục không được để trống.',
            });
        }

        const category = await Category.create(req.body);

        return res.status(201).json({
            success: true,
            data: category,
        });
    } catch (error) {
        console.error('Lỗi tạo danh mục:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tạo danh mục.',
        });
    }
});

app.put('/api/categories/update/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID danh mục không hợp lệ.',
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
                message: 'Không tìm thấy danh mục.',
            });
        }

        return res.status(200).json({
            success: true,
            data: category,
        });
    } catch (error) {
        console.error('Lỗi cập nhật danh mục:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể cập nhật danh mục.',
        });
    }
});

app.delete('/api/categories/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID danh mục không hợp lệ.',
            });
        }

        const category = await Category.findByIdAndDelete(id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy danh mục.',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Đã xóa danh mục.',
        });
    } catch (error) {
        console.error('Lỗi xóa danh mục:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể xóa danh mục.',
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
        console.error('Lỗi tải danh sách bài viết:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải danh sách bài viết.',
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
        console.error('Lỗi tải danh mục bài viết:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải danh mục bài viết.',
        });
    }
});

app.get('/api/admin/blog/slug', async (req, res) => {
    try {
        const slug = req.query.slug;

        if (isMissing(slug)) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu slug bài viết.',
            });
        }

        const blog = await Blog.findOne({
            slug: String(slug),
        }).lean();

        if (!blog) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bài viết.',
            });
        }

        return res.status(200).json({
            success: true,
            data: blog,
        });
    } catch (error) {
        console.error('Lỗi tải bài viết theo slug:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải bài viết.',
        });
    }
});

// ======================================================
// 9. DESTINATION API
// Khai báo route cụ thể trước route có tham số.
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
        console.error('Lỗi tải điểm đến nổi bật:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải điểm đến nổi bật.',
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
        console.error('Lỗi tải danh sách điểm đến:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải danh sách điểm đến.',
        });
    }
});

app.get('/api/destinations/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID điểm đến không hợp lệ.',
            });
        }

        const destination = await Destination.findById(id).lean();

        if (!destination) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy điểm đến.',
            });
        }

        return res.status(200).json({
            success: true,
            data: destination,
        });
    } catch (error) {
        console.error('Lỗi tải điểm đến:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tải điểm đến.',
        });
    }
});

app.post('/api/destinations/create', async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu điểm đến không được để trống.',
            });
        }

        const destination = await Destination.create(req.body);

        return res.status(201).json({
            success: true,
            data: destination,
        });
    } catch (error) {
        console.error('Lỗi tạo điểm đến:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể tạo điểm đến.',
        });
    }
});

app.put('/api/destinations/update/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID điểm đến không hợp lệ.',
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
                message: 'Không tìm thấy điểm đến.',
            });
        }

        return res.status(200).json({
            success: true,
            data: destination,
        });
    } catch (error) {
        console.error('Lỗi cập nhật điểm đến:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể cập nhật điểm đến.',
        });
    }
});

app.delete('/api/destinations/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID điểm đến không hợp lệ.',
            });
        }

        const destination = await Destination.findByIdAndDelete(id);

        if (!destination) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy điểm đến.',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Đã xóa điểm đến.',
        });
    } catch (error) {
        console.error('Lỗi xóa điểm đến:', error);

        return res.status(500).json({
            success: false,
            message: 'Không thể xóa điểm đến.',
        });
    }
});

// ======================================================
// 10. FALLBACK CHO API KHÔNG TỒN TẠI
// ======================================================

app.use('/api', (req, res) => {
    return res.status(404).json({
        success: false,
        message: `Không tìm thấy API: ${req.method} ${req.originalUrl}`,
    });
});

// ======================================================
// 11. KHỞI ĐỘNG SERVER SAU KHI KẾT NỐI MONGODB
// ======================================================

const startServer = async () => {
    try {
        if (!MONGO_URI) {
            throw new Error(
                'Thiếu MONGO_URI. Hãy kiểm tra file .env trong pacific-backend.'
            );
        }

        await mongoose.connect(MONGO_URI);

        console.log('✅ Đã kết nối thành công tới Database MongoDB!');

        // Bổ sung trường mặc định cho tour cũ nếu đang thiếu.
        await Tour.updateMany(
            { status: { $exists: false } },
            { $set: { status: 'PUBLISHED' } }
        );

        await Tour.updateMany(
            { region: { $exists: false } },
            { $set: { region: 'INSIDE' } }
        );

        console.log('✅ Đã kiểm tra trường status và region của tour.');

        app.listen(PORT, () => {
            console.log(
                `🚀 ROAM Backend đang chạy tại http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error(
            '❌ Không thể khởi động backend:',
            error.message
        );

        process.exit(1);
    }
};

startServer();