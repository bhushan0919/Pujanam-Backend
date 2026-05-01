const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage with dynamic destination based on field name
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/';
    
    // Determine folder based on field name or route
    if (file.fieldname === 'serviceImage') {
      uploadPath = 'uploads/services/';
    } else if (file.fieldname === 'panditImage') {
      uploadPath = 'uploads/pandits/';
    } else if (file.fieldname === 'image') {
      // Fallback: determine by route
      if (req.originalUrl.includes('/services')) {
        uploadPath = 'uploads/services/';
      } else if (req.originalUrl.includes('/pandits')) {
        uploadPath = 'uploads/pandits/';
      }
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Create unique filename with timestamp and original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, extension);
    
    // Clean filename and add prefix based on type
    let prefix = 'image';
    if (file.fieldname === 'serviceImage' || req.originalUrl.includes('/services')) {
      prefix = 'service';
    } else if (file.fieldname === 'panditImage' || req.originalUrl.includes('/pandits')) {
      prefix = 'pandit';
    }
    
    const cleanName = baseName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    cb(null, `${prefix}-${cleanName}-${uniqueSuffix}${extension}`);
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// ✅ FIX: Create and export the upload middleware correctly
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// ✅ FIX: Export the upload middleware
module.exports = upload;