// serviceController.js
const Service = require('../models/Service');
const fs = require('fs');
const path = require('path');

// Helper function to get image URL for services
const getServiceImageUrl = (req, filename) => {
  if (!filename) return '';
  return `${req.protocol}://${req.get('host')}/uploads/services/${filename}`;
};

// Get all services
exports.getAllServices = async (req, res) => {
  try {
    const services = await Service.find().sort({ name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get active services
exports.getActiveServices = async (req, res) => {
  try {
    const services = await Service.find({ isActive: true }).sort({ name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create new service with image upload
exports.createService = async (req, res) => {
  try {
    const serviceData = {
      ...req.body,
      image: req.file ? getServiceImageUrl(req, req.file.filename) : req.body.image
    };

    // Parse array fields from string to array
    if (typeof serviceData.details === 'string') {
      serviceData.details = JSON.parse(serviceData.details);
    }

    const service = new Service(serviceData);
    await service.save();
    
    //console.log(`✅ Service created with image: ${service.image}`);
    
    res.status(201).json(service);
  } catch (error) {
    // Delete uploaded file if there's an error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ message: error.message });
  }
};

// Update service with image upload
exports.updateService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Store old image path for deletion
    const oldImage = service.image;

    const updateData = {
      ...req.body,
      image: req.file ? getServiceImageUrl(req, req.file.filename) : req.body.image
    };

    // Parse array fields
    if (typeof updateData.details === 'string') {
      updateData.details = JSON.parse(updateData.details);
    }

    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Delete old image if new image was uploaded
    if (req.file && oldImage && !oldImage.includes('/images/')) {
      const oldFilename = oldImage.split('/').pop();
      const oldImagePath = path.join('uploads', 'services', oldFilename);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        //console.log(`🗑️ Deleted old service image: ${oldFilename}`);
      }
    }

    //console.log(`✅ Service updated with image: ${updatedService.image}`);
    
    res.json(updatedService);
  } catch (error) {
    // Delete uploaded file if there's an error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ message: error.message });
  }
};

// Delete service
exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Delete associated image file if it's not a default image
    if (service.image && !service.image.includes('/images/')) {
      const filename = service.image.split('/').pop();
      const imagePath = path.join('uploads', 'services', filename);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        //console.log(`🗑️ Deleted service image: ${filename}`);
      }
    }

    await Service.findByIdAndDelete(req.params.id);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get service by ID
exports.getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};