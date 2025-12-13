const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
const organizationsDir = path.join(uploadsDir, 'organizations');
const stationsDir = path.join(uploadsDir, 'stations');
const logosDir = path.join(organizationsDir, 'logos');
const documentsDir = path.join(organizationsDir, 'documents');
const galleryImagesDir = path.join(stationsDir, 'gallery');

[uploadsDir, organizationsDir, stationsDir, logosDir, documentsDir, galleryImagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure storage for organization logos
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, logosDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${ext}`);
  }
});

// Configure storage for organization documents
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, documentsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

// File filter for images
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed for logos'), false);
  }
};

// File filter for documents
const documentFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: images, PDF, Word documents'), false);
  }
};

// Multer instances
const uploadLogo = multer({
  storage: logoStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

const uploadDocument = multer({
  storage: documentStorage,
  fileFilter: documentFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Middleware for handling multiple document uploads
// Handles field names like documents[0][file], documents[1][file], etc.
const uploadMultipleDocuments = (req, res, next) => {
  const upload = multer({
    storage: documentStorage,
    fileFilter: documentFilter,
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit per file
    }
  }).any(); // Accept any field name to handle dynamic document fields
  
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error'
      });
    }
    // Filter to only include document files (not logo)
    if (req.files) {
      req.files = req.files.filter(file => 
        file.fieldname && file.fieldname.includes('documents') && file.fieldname.includes('[file]')
      );
    }
    next();
  });
};

// Configure storage for station gallery images
const galleryImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, galleryImagesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `gallery-${uniqueSuffix}${ext}`);
  }
});

// File filter for gallery images (only images)
const galleryImageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed for gallery images'), false);
  }
};

// Multer instance for gallery images
const uploadGalleryImage = multer({
  storage: galleryImageStorage,
  fileFilter: galleryImageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Middleware for handling multiple gallery image uploads
// Handles field names like galleryImages[0][file], galleryImages[1][file], etc.
// Allows all fields to pass through, only processes gallery image files
const uploadMultipleGalleryImages = (req, res, next) => {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        // Only handle gallery image files, ignore other fields
        if (file.fieldname && file.fieldname.includes('galleryImages') && file.fieldname.includes('[file]')) {
          cb(null, galleryImagesDir);
        } else {
          // For non-file fields or other files, skip (they'll be in req.body)
          cb(null, '/tmp'); // Temporary, won't be used
        }
      },
      filename: (req, file, cb) => {
        // Only process gallery images
        if (file.fieldname && file.fieldname.includes('galleryImages') && file.fieldname.includes('[file]')) {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const ext = path.extname(file.originalname);
          cb(null, `gallery-${uniqueSuffix}${ext}`);
        } else {
          cb(null, file.originalname);
        }
      }
    }),
    fileFilter: (req, file, cb) => {
      // Only validate gallery image files
      if (file.fieldname && file.fieldname.includes('galleryImages') && file.fieldname.includes('[file]')) {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed for gallery images'), false);
        }
      } else {
        // Allow other fields to pass through (they're not files)
        cb(null, true);
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit per file
    }
  }).any(); // Accept any field name to handle dynamic fields
  
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error'
      });
    }
    // Filter to only include gallery image files in req.files
    if (req.files && Array.isArray(req.files)) {
      req.files = req.files.filter(file => 
        file.fieldname && file.fieldname.includes('galleryImages') && file.fieldname.includes('[file]')
      );
    }
    next();
  });
};

module.exports = {
  uploadLogo,
  uploadDocument,
  uploadMultipleDocuments,
  uploadGalleryImage,
  uploadMultipleGalleryImages,
  logosDir,
  documentsDir,
  galleryImagesDir
};

