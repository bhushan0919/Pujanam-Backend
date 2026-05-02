// server.js

// ================= IMPORTS =================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();


// ================= ENVIRONMENT CHECK =================
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.warn('⚠️ Missing environment variables:', missingEnvVars.join(', '));
  console.warn('Using fallback values for development');
}

// ================= APP INIT =================
const app = express();
app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" }, // Changed from 'cross-origin'
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: [
        "'self'",
        process.env.NODE_ENV === 'production' 
          ? 'https://yourdomain.com' 
          : 'http://localhost:5000'
      ],
      frameSrc: ["'self'", "https://checkout.razorpay.com"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ================= CREATE HTTP SERVER =================
const server = http.createServer(app);

// ================= SOCKET.IO =================
const io = socketIo(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST']
  },
  // ✅ Add these options
  transports: ['websocket', 'polling'],
  allowEIO3: true,  // Allow Engine.IO v3 clients
  pingTimeout: 60000,
  pingInterval: 25000
});

io.engine.on('connection_error', (err) => {
  //console.log('❌ Socket connection error:', err);
});

// Make io accessible to routes
app.set('io', io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  //console.log('🟢 New client connected:', socket.id);

  socket.on('register', (data) => {
    const { userId, role } = data;
    const room = `${role}_${userId}`;
    socket.join(room);
    //console.log(`📌 User ${userId} (${role}) joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    //console.log('🔴 Client disconnected:', socket.id);
  });
});

// ================= CORS =================
app.use(cors({
  origin: function (origin, callback) {
    // Allow Netlify frontend domain
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://pujanam.netlify.app', // ← CHANGE THIS to your actual Netlify URL
      /\.netlify\.app$/  // Allow all Netlify preview URLs
    ];
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) return allowed.test(origin);
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Request-Id']
}));

app.options('*', cors());

app.use((req, res, next) => {
  // Set headers for all static assets
  if (req.url.startsWith('/uploads/')) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  next();
});

// ================= BODY PARSER =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ================= REQUEST LOGGER =================
app.use((req, res, next) => {
  //console.log(`🌐 INCOMING REQUEST: ${req.method} ${req.url}`);
  //console.log('Origin:', req.headers.origin);
  //console.log('Authorization:', req.headers.authorization ? 'Present' : 'None');
  next();
});

app.use(logger);

// ================= STATIC FILES =================
app.use('/uploads/services', express.static(path.join(__dirname, 'uploads/services'), {
  setHeaders: (res) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', '*');
  }
}));
app.use('/uploads/pandits', express.static(path.join(__dirname, 'uploads/pandits'), {
  setHeaders: (res) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', '*');
  }
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ================= DATABASE =================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pujanam', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error:'));

db.once('open', async () => {
  //console.log('✅ Connected to MongoDB');

  try {
    const collections = ['bookings', 'pandits', 'services', 'notifications', 'customers'];

    for (const collection of collections) {
      try {
        await mongoose.connection.db.collection(collection).createIndexes();
        //console.log(`✅ Indexes created for ${collection}`);
      } catch (err) {
        //console.log(`ℹ️ No indexes needed for ${collection}:`, err.message);
      }
    }

  } catch (error) {
    console.error('❌ Error creating indexes:', error);
  }
});

// ================= HEALTH ROUTES =================
app.get('/api/health', (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };
  res.json(health);
});

app.get('/api/health/detailed', (req, res) => {

  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    responseTime: Date.now()
  };

  mongoose.connection.db.command({ ping: 1 }, (err) => {
    health.dbPing = err ? 'failed' : 'success';
    health.responseTime = Date.now() - health.responseTime;

    if (health.responseTime > 1000) {
      //console.log(`⚠️ Slow database ping: ${health.responseTime}ms`);
    }

    res.json(health);
  });

});

// ================= DEBUG ROUTES =================

app.get('/api/debug', (req, res) => {
  res.json({
    message: 'Debug route working!',
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/debug/pandits', async (req, res) => {

  try {

    const Pandit = require('./models/Pandit');

    const pandits = await Pandit.find().select('name username email password');

    res.json({
      count: pandits.length,
      pandits: pandits.map(p => ({
        name: p.name,
        username: p.username,
        email: p.email,
        hasPassword: !!p.password,
        passwordLength: p.password ? p.password.length : 0
      }))
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});

app.get('/api/debug/users', async (req, res) => {

  try {

    const User = require('./models/User');

    const users = await User.find();

    console.log('📊 Database Users:', users);

    res.json({
      totalUsers: users.length,
      users: users.map(u => ({
        id: u._id,
        email: u.email,
        username: u.username,
        role: u.role,
        hasPassword: !!u.password,
        passwordLength: u.password?.length,
        createdAt: u.createdAt
      }))
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});

app.get('/api/debug/token', async (req, res) => {

  try {

    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) return res.json({ error: 'No token provided' });

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret-for-development'
    );

    const Pandit = require('./models/Pandit');

    const pandit = await Pandit.findById(decoded.id);

    res.json({
      tokenValid: true,
      decoded,
      pandit
    });

  } catch (error) {
    res.json({
      tokenValid: false,
      error: error.message
    });
  }

});

app.get('/api/debug/bookings', async (req, res) => {

  try {

    const Booking = require('./models/Booking');

    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('serviceId', 'name')
      .lean();

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});

app.get('/api/debug/notifications', async (req, res) => {

  try {

    const Notification = require('./models/Notification');

    const notifications = await Notification.find()
      .populate('panditId', 'name email')
      .populate({
        path: 'bookingId',
        populate: {
          path: 'serviceId',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      count: notifications.length,
      notifications
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});

app.get('/api/test', (req, res) => {
  //console.log('✅ Test endpoint hit!');
  res.json({ message: 'Test endpoint working' });
});

app.get('/api/test-bookings', async (req, res) => {

  try {

    const Booking = require('./models/Booking');

    const count = await Booking.countDocuments();

    //console.log('📊 Test bookings - count:', count);

    res.json({
      success: true,
      message: 'Bookings test working',
      count
    });

  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }

});

// ================= API ROUTES =================
app.use('/api/pandit/auth', require('./routes/panditAuth'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/pandits', require('./routes/pandits'));
app.use('/api/services', require('./routes/services'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/pandit', require('./routes/pandit'));
app.use('/api/user', require('./routes/user'));
app.use('/api/payment', require('./routes/payment'));

// ================= ERROR HANDLER =================
app.use(errorHandler);



// ================= 404 =================
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});



// ================= START SERVER =================
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {

  //console.log(`🚀 Server is running on port ${PORT}`);
  //console.log(`🌐 Local: http://localhost:${PORT}`);
  //console.log(`🌐 Network: http://127.0.0.1:${PORT}`);
  //console.log(`🔧 Health: http://localhost:${PORT}/api/health`);
  //console.log(`🔌 Socket.IO ready`);

});