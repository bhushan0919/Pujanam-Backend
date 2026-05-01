// backend/routes/panditAuth.js - FIXED VERSION
const express = require('express');
const router = express.Router(); // ← THIS WAS MISSING!
const Pandit = require('../models/Pandit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  //console.log('🔐 Pandit login attempt for:', username);

  try {
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    const pandit = await Pandit.findOne({ username });
     

    
    if (!pandit) {
      //console.log('❌ Pandit not found:', username);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }

    //console.log('✅ Pandit found:', pandit.name);
    //console.log('   Stored hash exists:', !!pandit.password);

    // Check password
    const isMatch = await bcrypt.compare(password, pandit.password);
    //console.log('   Password match:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }

     pandit.isOnline = true;
    pandit.lastActivityAt = new Date();
    pandit.lastLoginAt = new Date();
    await pandit.save();
    
    // Generate JWT
    const token = jwt.sign(
      { 
        id: pandit._id.toString(),
        role: 'pandit',
        email: pandit.email,
        name: pandit.name
      },
      process.env.JWT_SECRET || 'fallback-secret-for-development',
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      token,
      pandit: {
        id: pandit._id,
        name: pandit.name,
        username: pandit.username,
        location: pandit.location,
        services: pandit.services,
        contact: pandit.contact,
        email: pandit.email,
        rating: pandit.rating,
        experience: pandit.experience,
        languages: pandit.languages,
        image: pandit.image,
        isAvailable: pandit.isAvailable,
        isOnline: pandit.isOnline || false
      }
    });
  } catch (err) {
    console.error('❌ Pandit login error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + err.message 
    });
  }
});

module.exports = router;