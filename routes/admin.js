// backend/routes/admin.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); 
const adminController = require('../controllers/adminController');
const panditController = require('../controllers/panditController');
const serviceController = require('../controllers/serviceController');
const { authenticateAdmin, isAdmin } = require('../middleware/auth');
const Booking = require('../models/Booking'); 
const { validatePandit, validateService } = require('../middleware/validation');
const upload = require('../middleware/cloudinaryUpload');
const SupportTicket = require('../models/SupportTicket');

// Handle OPTIONS requests for all routes
router.options('*', (req, res) => {
  console.log('📡 OPTIONS request received for admin route');
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// ✅ FIXED: Public routes (no authentication required)
router.post('/login', adminController.adminLogin);

// ✅ FIXED: Apply admin middleware ONLY to protected routes
router.use(authenticateAdmin);
router.use(isAdmin);

// Test route to verify authentication is working
router.get('/test-auth', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Admin authentication working!',
    user: req.user 
  });
});

// ✅ Now these routes are protected
router.get('/dashboard', adminController.getDashboardStats);
router.get('/all-data', adminController.getAllData);

// Pandit management with image upload
router.post('/pandits', upload.single('panditImage'), validatePandit, panditController.createPandit);
router.put('/pandits/:id', upload.single('panditImage'), validatePandit, panditController.updatePandit);
router.delete('/pandits/:id', panditController.deletePandit);
router.patch('/pandits/:id/toggle-availability', adminController.togglePanditAvailability);
router.post('/pandits/bulk-update', adminController.bulkUpdatePandits);

// Service management with image upload
router.post('/services', upload.single('serviceImage'), validateService, serviceController.createService);
router.put('/services/:id', upload.single('serviceImage'), validateService, serviceController.updateService);
router.delete('/services/:id', serviceController.deleteService);
router.patch('/services/:id/toggle-activity', adminController.toggleServiceActivity);
router.post('/services/bulk-update', adminController.bulkUpdateServices);


// pandits booking history

// Get all bookings with filters
router.get('/bookings', authenticateAdmin, async (req, res) => {
  console.log('📡 BOOKINGS ROUTE HIT');
  console.log('   User:', req.user?.email);
  
  try {
    const mongoose = require('mongoose'); // Ensure mongoose is available
    
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      console.log('❌ Database not connected');
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection error' 
      });
    }
    
    const Booking = require('../models/Booking');
    
    // Get query parameters
    const { status, page = 1, limit = 50 } = req.query;
    
    // Build query
    let query = {};
    if (status) query.status = status;
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const bookings = await Booking.find(query)
      .populate('serviceId', 'name price')
      .populate('panditId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await Booking.countDocuments(query);
    
    // Calculate stats
    const stats = {
      total,
      pending: await Booking.countDocuments({ status: 'pending' }),
      notified: await Booking.countDocuments({ status: 'notified' }),
      accepted: await Booking.countDocuments({ status: 'accepted' }),
      confirmed: await Booking.countDocuments({ status: 'confirmed' }),
      completed: await Booking.countDocuments({ status: 'completed' }),
      cancelled: await Booking.countDocuments({ status: 'cancelled' })
    };
    
    console.log(`✅ Found ${bookings.length} bookings`);
    
    res.json({
      success: true,
      bookings,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('❌ Bookings route error:', error);
    console.error('   Stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      message: error.message,
      error: error.toString()
    });
  }
});
// Get pandit performance stats
router.get('/pandits/performance', authenticateAdmin, (req, res) => {
  console.log('📊 Pandit performance endpoint hit');
  res.json({
    success: true,
    pandits: [] // Return empty array for now
  });
});

// Get booking analytics
router.get('/analytics/bookings', adminController.getBookingAnalytics);

// Get recent activity
router.get('/activity/recent', authenticateAdmin, (req, res) => {
  console.log('📊 Recent activity endpoint hit');
  res.json({
    success: true,
    activities: [] // Return empty array for now
  });
});



// Get single booking details
router.get('/bookings/:id', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('serviceId')
      .populate('panditId')
      .populate('customerId');
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update booking status (admin override)
router.patch('/bookings/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    res.json({ 
      success: true, 
      message: 'Booking status updated',
      booking 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all support tickets (admin)
router.get('/support-tickets', authenticateAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    let query = {};
    if (status) query.status = status;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const tickets = await SupportTicket.find(query)
      .populate('customerId', 'name email phone')
      .populate('bookingId', 'serviceId dateTime price status name contact')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const total = await SupportTicket.countDocuments(query);
    
    // Get statistics
    const stats = {
      total: await SupportTicket.countDocuments(),
      open: await SupportTicket.countDocuments({ status: 'open' }),
      inProgress: await SupportTicket.countDocuments({ status: 'in_progress' }),
      resolved: await SupportTicket.countDocuments({ status: 'resolved' }),
      closed: await SupportTicket.countDocuments({ status: 'closed' })
    };
    
    res.json({
      success: true,
      tickets,
      stats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
    
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get single support ticket details
router.get('/support-tickets/:id', authenticateAdmin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('customerId', 'name email phone')
      .populate('bookingId', 'serviceId dateTime price status name contact address');
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }
    
    res.json({
      success: true,
      ticket
    });
    
  } catch (error) {
    console.error('Error fetching support ticket:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update support ticket status (admin)
router.patch('/support-tickets/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status, adminResponse } = req.body;
    
    const updateData = {
      status,
      updatedAt: new Date()
    };
    
    if (adminResponse) {
      updateData.adminResponse = adminResponse;
    }
    
    if (status === 'resolved') {
      updateData.resolvedAt = new Date();
    }
    
    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }
    
    console.log(`✅ Ticket ${ticket._id} status updated to: ${status}`);
    
    res.json({
      success: true,
      message: 'Support ticket updated successfully',
      ticket
    });
    
  } catch (error) {
    console.error('Error updating support ticket:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete support ticket (admin)
router.delete('/support-tickets/:id', authenticateAdmin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findByIdAndDelete(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Support ticket deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting support ticket:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Cancel booking by admin (for support requests)
router.post('/bookings/:bookingId/admin-cancel', authenticateAdmin, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;
    
    const Booking = require('../models/Booking');
    
    const booking = await Booking.findById(bookingId)
      .populate('serviceId', 'name')
      .populate('customerId', 'name email');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // Check if booking is already cancelled or completed
    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }
    
    if (booking.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a completed booking'
      });
    }
    
    // ✅ NO TIME LIMIT CHECK FOR ADMIN - Can cancel anytime
    
    const bookingDate = new Date(booking.dateTime);
    const now = new Date();
    const hoursDifference = (bookingDate - now) / (1000 * 60 * 60);
    
    // Update booking status
    const previousStatus = booking.status;
    booking.status = 'cancelled';
    booking.cancelledBy = 'admin';
    booking.cancelledAt = new Date();
    booking.cancellationReason = reason || 'Cancelled by admin';
    booking.cancelledAtHours = hoursDifference;
    
    await booking.save();
    
    console.log(`✅ Admin cancelled booking ${bookingId}`);
    console.log(`   Previous Status: ${previousStatus}`);
    console.log(`   Hours before puja: ${hoursDifference.toFixed(2)}`);
    console.log(`   Reason: ${reason || 'Admin action'}`);
    
    res.json({
      success: true,
      message: `Booking cancelled successfully${hoursDifference < 2 ? ' (less than 2 hours before puja)' : ''}`,
      booking: {
        id: booking._id,
        status: booking.status,
        customerName: booking.name,
        serviceName: booking.serviceId?.name,
        dateTime: booking.dateTime,
        cancelledAt: booking.cancelledAt,
        hoursBeforePuja: hoursDifference
      }
    });
    
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;