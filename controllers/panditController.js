// panditController.js
const Pandit = require('../models/Pandit');
const fs = require('fs');
const path = require('path');

// Helper function to get image URL for pandits
const getPanditImageUrl = (req, filename) => {
  if (!filename) return '/images/icon.png'; // Default image
  return `${req.protocol}://${req.get('host')}/uploads/pandits/${filename}`;
};

// Get all pandits with filters
exports.getAllPandits = async (req, res) => {
  try {
    const { search, location, service, page = 1, limit = 10 } = req.query;
    
    let query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { services: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Location filter
    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }
    
    // Service filter
    if (service) {
      query.services = { $in: [new RegExp(service, 'i')] };
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const pandits = await Pandit.find(query)
      .select('name location services rating experience image isAvailable')
      .limit(limitNum)
      .skip(skip)
      .sort({ rating: -1, experience: -1 });
    
    const total = await Pandit.countDocuments(query);
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      pandits,
      totalPages,
      currentPage: pageNum,
      total
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get filter options
exports.getFilterOptions = async (req, res) => {
  try {
    const locations = await Pandit.distinct('location');
    const services = await Pandit.distinct('services');
    
    res.json({
      locations: locations.filter(loc => loc).sort(),
      services: services.filter(srv => srv).sort()
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get unique locations from pandits
exports.getPanditLocations = async (req, res) => {
  try {
    console.log('📍 Fetching unique pandit locations...');
    
    // Check if Pandit model exists and has data
    const Pandit = require('../models/Pandit');
    
    // Get all distinct locations
    const locations = await Pandit.distinct('location');
    
    console.log('Raw locations from DB:', locations);
    
    // Filter out empty, null, undefined values
    const validLocations = locations.filter(loc => {
      return loc && typeof loc === 'string' && loc.trim().length > 0;
    });
    
    // Sort alphabetically
    validLocations.sort();
    
    console.log('Valid locations to return:', validLocations);
    
    res.json({
      success: true,
      locations: validLocations,
      total: validLocations.length
    });
  } catch (error) {
    console.error('Error fetching pandit locations:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      locations: [] 
    });
  }
};

// Get single pandit
exports.getPanditById = async (req, res) => {
  try {
    const pandit = await Pandit.findById(req.params.id);
    if (!pandit) {
      return res.status(404).json({ message: 'Pandit not found' });
    }
    res.json(pandit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create new pandit with image upload
exports.createPandit = async (req, res) => {
  try {
    const panditData = {
      ...req.body,
      image: req.file ? getPanditImageUrl(req, req.file.filename) : (req.body.image || '/images/icon.png')
    };

    // Parse array fields from string to array
    if (typeof panditData.services === 'string') {
      panditData.services = JSON.parse(panditData.services);
    }
    if (typeof panditData.languages === 'string') {
      panditData.languages = JSON.parse(panditData.languages);
    }

    // Convert numeric fields
    if (panditData.rating) panditData.rating = parseFloat(panditData.rating);
    if (panditData.experience) panditData.experience = parseInt(panditData.experience);

    const pandit = new Pandit(panditData);
    await pandit.save();
    
    console.log(`✅ Pandit created with image: ${pandit.image}`);
    
    res.status(201).json(pandit);
  } catch (error) {
    // Delete uploaded file if there's an error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ message: error.message });
  }
};

// Update pandit with image upload
exports.updatePandit = async (req, res) => {
  try {
    console.log('📝 Update pandit request received');
    console.log('   Params ID:', req.params.id);
    console.log('   Body:', req.body);
    console.log('   File:', req.file ? req.file.filename : 'No file');
    
    const pandit = await Pandit.findById(req.params.id);
    if (!pandit) {
      return res.status(404).json({ 
        success: false,
        message: 'Pandit not found' 
      });
    }

    // Store old image path for deletion
    const oldImage = pandit.image;

    const updateData = { ...req.body };
    
    // Handle image update
    if (req.file) {
      updateData.image = `${req.protocol}://${req.get('host')}/uploads/pandits/${req.file.filename}`;
    }

    // Parse array fields
    if (typeof updateData.services === 'string') {
      try {
        updateData.services = JSON.parse(updateData.services);
      } catch (e) {
        console.log('Services parsing error:', e);
      }
    }
    
    if (typeof updateData.languages === 'string') {
      try {
        updateData.languages = JSON.parse(updateData.languages);
      } catch (e) {
        console.log('Languages parsing error:', e);
      }
    }

    // Convert numeric fields
    if (updateData.rating) updateData.rating = parseFloat(updateData.rating);
    if (updateData.experience) updateData.experience = parseInt(updateData.experience);

    // Handle password - only update if provided and not placeholder
    if (updateData.password && updateData.password === 'pandit123') {
      // This is the default placeholder, don't update if pandit already has password
      if (!pandit.password || pandit.password === 'pandit123') {
        // Only set if it's actually new
        console.log('Using default password for new pandit');
      } else {
        // Don't override existing password with placeholder
        delete updateData.password;
      }
    }

    console.log('📦 Final update data:', updateData);

    const updatedPandit = await Pandit.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    // Delete old image if new image was uploaded and it's not the default icon
    if (req.file && oldImage && !oldImage.includes('/images/icon.png')) {
      const oldFilename = oldImage.split('/').pop();
      const oldImagePath = path.join('uploads', 'pandits', oldFilename);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        console.log(`🗑️ Deleted old pandit image: ${oldFilename}`);
      }
    }

    console.log(`✅ Pandit updated: ${updatedPandit.name}`);
    
    res.json({
      success: true,
      message: 'Pandit updated successfully',
      pandit: updatedPandit
    });
    
  } catch (error) {
    console.error('❌ Error updating pandit:', error);
    
    // Delete uploaded file if there's an error
    if (req.file) {
      const filePath = path.join('uploads', 'pandits', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Delete pandit
exports.deletePandit = async (req, res) => {
  try {
    const pandit = await Pandit.findById(req.params.id);
    
    if (!pandit) {
      return res.status(404).json({ message: 'Pandit not found' });
    }

    // Delete associated image file if it's not the default icon
    if (pandit.image && !pandit.image.includes('/images/icon.png')) {
      const filename = pandit.image.split('/').pop();
      const imagePath = path.join('uploads', 'pandits', filename);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log(`🗑️ Deleted pandit image: ${filename}`);
      }
    }

    await Pandit.findByIdAndDelete(req.params.id);
    res.json({ message: 'Pandit deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};