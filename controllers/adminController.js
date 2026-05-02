// backend/controllers/adminController.js - COMPLETE FILE
const mongoose = require('mongoose');
const Pandit = require('../models/Pandit');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Customer = require('../models/Customer');
const SupportTicket = require('../models/SupportTicket');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Admin dashboard stats
exports.getDashboardStats = async (req, res) => {
  try {
    const totalPandits = await Pandit.countDocuments();
    const totalServices = await Service.countDocuments();
    const availablePandits = await Pandit.countDocuments({ isAvailable: true });
    const activeServices = await Service.countDocuments({ isActive: true });

    // Get payment stats for dashboard
    const paidBookings = await Booking.countDocuments({ paymentStatus: 'completed' });
    const totalAdvanceAmount = await Booking.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$advanceAmount' } } }
    ]);

    res.json({
      totalPandits,
      totalServices,
      availablePandits,
      activeServices,
      totalAdvanceAmount: totalAdvanceAmount[0]?.total || 0,
      paidBookingsCount: paidBookings,
      recentPandits: await Pandit.find().sort({ createdAt: -1 }).limit(5),
      recentServices: await Service.find().sort({ createdAt: -1 }).limit(5)
    });
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({ message: error.message });
  }
};


// Bulk operations for pandits
exports.bulkUpdatePandits = async (req, res) => {
  try {
    const { ids, updateData } = req.body;
    
    const result = await Pandit.updateMany(
      { _id: { $in: ids } },
      { $set: updateData }
    );
    
    res.json({
      message: `${result.modifiedCount} pandits updated successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Bulk operations for services
exports.bulkUpdateServices = async (req, res) => {
  try {
    const { ids, updateData } = req.body;
    
    const result = await Service.updateMany(
      { _id: { $in: ids } },
      { $set: updateData }
    );
    
    res.json({
      message: `${result.modifiedCount} services updated successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin login - FIXED VERSION
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Admin login attempt for:', email);
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      console.log('❌ User is not admin:', user.role);
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    console.log('🔑 Password validation result:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token with consistent structure
    const token = jwt.sign(
      { 
        userId: user._id.toString(),
        id: user._id.toString(), // Add both for compatibility
        role: user.role,
        email: user.email,
        username: user.username
      },
      process.env.JWT_SECRET || 'fallback-secret-for-development',
      { expiresIn: '24h' }
    );

    console.log('✅ Login successful for:', user.email);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.username
      }
    });
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
};

// Get all data for admin panel
exports.getAllData = async (req, res) => {
  try {
    const pandits = await Pandit.find().sort({ createdAt: -1 });
    const services = await Service.find().sort({ createdAt: -1 });
    
    res.json({
      pandits,
      services
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle pandit availability
exports.togglePanditAvailability = async (req, res) => {
  try {
    const pandit = await Pandit.findById(req.params.id);
    
    if (!pandit) {
      return res.status(404).json({ message: 'Pandit not found' });
    }
    
    pandit.isAvailable = !pandit.isAvailable;
    await pandit.save();
    
    res.json({
      message: `Pandit ${pandit.isAvailable ? 'activated' : 'deactivated'} successfully`,
      pandit
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle service activity
exports.toggleServiceActivity = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    service.isActive = !service.isActive;
    await service.save();
    
    res.json({
      message: `Service ${service.isActive ? 'activated' : 'deactivated'} successfully`,
      service
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// pandit data to admin dashboard

// Get all bookings with pandit details
exports.getAllBookings = async (req, res) => {
  try {
    console.log('📡 Admin getAllBookings called');
    console.log('   User:', req.user?.email);
    
    const { status, panditId, fromDate, toDate, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    // Apply filters
    if (status) query.status = status;
    if (panditId) query.panditId = panditId;
    if (fromDate || toDate) {
      query.dateTime = {};
      if (fromDate) query.dateTime.$gte = new Date(fromDate);
      if (toDate) query.dateTime.$lte = new Date(toDate);
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const bookings = await Booking.find(query)
      .populate('serviceId', 'name price category')
      .populate('panditId', 'name email contact location rating')
      .populate('customerId', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const total = await Booking.countDocuments(query);
    
    // Calculate statistics
    const stats = {
      total: total,
      pending: await Booking.countDocuments({ status: 'pending' }),
      notified: await Booking.countDocuments({ status: 'notified' }),
      accepted: await Booking.countDocuments({ status: 'accepted' }),
      confirmed: await Booking.countDocuments({ status: 'confirmed' }),
      completed: await Booking.countDocuments({ status: 'completed' }),
      cancelled: await Booking.countDocuments({ status: 'cancelled' })
    };
    
    const paidBookings = await Booking.find({ paymentStatus: 'completed' });
    const totalAdvanceAmount = paidBookings.reduce((sum, b) => sum + (b.advanceAmount || 0), 0);
    
    stats.totalAdvanceAmount = totalAdvanceAmount;
    stats.paidBookings = paidBookings.length;
    
    res.json({
      success: true,
      bookings,
      stats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Get all bookings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get pandit performance stats
exports.getPanditPerformance = async (req, res) => {
  try {
    const pandits = await Pandit.find()
      .select('name email contact location rating experience isAvailable')
      .lean();
    
    const performanceData = await Promise.all(
      pandits.map(async (pandit) => {
        const totalBookings = await Booking.countDocuments({ panditId: pandit._id });
        const completedBookings = await Booking.countDocuments({ 
          panditId: pandit._id, 
          status: 'completed' 
        });
        const acceptedBookings = await Booking.countDocuments({ 
          panditId: pandit._id, 
          status: { $in: ['accepted', 'confirmed', 'completed'] } 
        });
        const cancelledBookings = await Booking.countDocuments({ 
          panditId: pandit._id, 
          status: 'cancelled' 
        });
        
        // Calculate earnings
        const completed = await Booking.find({ 
          panditId: pandit._id, 
          status: 'completed' 
        }).select('actualPrice');
        
        const totalEarnings = completed.reduce((sum, booking) => 
          sum + (booking.actualPrice || 0), 0);
        
        // Get recent bookings
        const recentBookings = await Booking.find({ panditId: pandit._id })
          .populate('serviceId', 'name')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();
        
        return {
          ...pandit,
          stats: {
            totalBookings,
            completedBookings,
            acceptedBookings,
            cancelledBookings,
            totalEarnings,
            acceptanceRate: totalBookings > 0 
              ? Math.round((acceptedBookings / totalBookings) * 100) 
              : 0,
            completionRate: acceptedBookings > 0 
              ? Math.round((completedBookings / acceptedBookings) * 100) 
              : 0
          },
          recentBookings: recentBookings.map(b => ({
            id: b._id,
            service: b.serviceId?.name,
            date: b.dateTime,
            status: b.status,
            price: b.price
          }))
        };
      })
    );
    
    res.json({
      success: true,
      pandits: performanceData
    });
  } catch (error) {
    console.error('Get pandit performance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get detailed booking analytics
exports.getBookingAnalytics = async (req, res) => {
  try {
    const { period = 'month' } = req.query; // day, week, month, year
    
    let dateFilter = {};
    const now = new Date();
    
    if (period === 'day') {
      const today = new Date(now.setHours(0, 0, 0, 0));
      dateFilter = { $gte: today };
    } else if (period === 'week') {
      const weekAgo = new Date(now.setDate(now.getDate() - 7));
      dateFilter = { $gte: weekAgo };
    } else if (period === 'month') {
      const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
      dateFilter = { $gte: monthAgo };
    } else if (period === 'year') {
      const yearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
      dateFilter = { $gte: yearAgo };
    }
    
    // Bookings over time
    const bookingsOverTime = await Booking.aggregate([
      { $match: dateFilter ? { createdAt: dateFilter } : {} },
      {
        $group: {
          _id: { 
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    // Popular services
    const popularServices = await Booking.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$serviceId',
          count: { $sum: 1 },
          totalEarnings: { $sum: '$actualPrice' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'services',
          localField: '_id',
          foreignField: '_id',
          as: 'service'
        }
      },
      { $unwind: '$service' }
    ]);
    
    // Pandit rankings
    const topPandits = await Booking.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$panditId',
          completedBookings: { $sum: 1 },
          totalEarnings: { $sum: '$actualPrice' }
        }
      },
      { $sort: { completedBookings: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'pandits',
          localField: '_id',
          foreignField: '_id',
          as: 'pandit'
        }
      },
      { $unwind: '$pandit' }
    ]);
    
    res.json({
      success: true,
      analytics: {
        period,
        bookingsOverTime,
        popularServices: popularServices.map(s => ({
          name: s.service.name,
          bookings: s.count,
          earnings: s.totalEarnings
        })),
        topPandits: topPandits.map(p => ({
          name: p.pandit.name,
          completedBookings: p.completedBookings,
          earnings: p.totalEarnings,
          rating: p.pandit.rating
        }))
      }
    });
  } catch (error) {
    console.error('Get booking analytics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get booking details by ID
exports.getBookingDetails = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('serviceId')
      .populate('panditId')
      .populate('customerId');
    
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }
    
    res.json({ 
      success: true, 
      booking 
    });
  } catch (error) {
    console.error('Get booking details error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Update booking status
exports.updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Booking status updated',
      booking 
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get recent activity feed
exports.getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const recentBookings = await Booking.find()
      .populate('serviceId', 'name')
      .populate('panditId', 'name')
      .populate('customerId', 'name')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
    
    const activities = recentBookings.map(booking => {
      let action = '';
      let description = '';
      
      switch(booking.status) {
        case 'pending':
          action = '🆕 New Booking';
          description = `New booking for ${booking.serviceId?.name}`;
          break;
        case 'notified':
          action = '📢 Pandits Notified';
          description = `Pandits notified about ${booking.serviceId?.name}`;
          break;
        case 'accepted':
          action = '✅ Booking Accepted';
          description = `${booking.panditId?.name} accepted ${booking.serviceId?.name}`;
          break;
        case 'confirmed':
          action = '✓ Booking Confirmed';
          description = `${booking.panditId?.name} confirmed for ${booking.serviceId?.name}`;
          break;
        case 'completed':
          action = '🎉 Puja Completed';
          description = `${booking.panditId?.name} completed ${booking.serviceId?.name}`;
          break;
        case 'cancelled':
          action = '❌ Booking Cancelled';
          description = `${booking.serviceId?.name} booking cancelled`;
          break;
      }
      
      return {
        id: booking._id,
        action,
        description,
        customer: booking.name,
        pandit: booking.panditId?.name,
        time: booking.updatedAt,
        status: booking.status
      };
    });
    
    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};