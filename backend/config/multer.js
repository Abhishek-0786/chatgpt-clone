const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
const organizationsDir = path.join(uploadsDir, 'organizations');
const logosDir = path.join(organizationsDir, 'logos');
const documentsDir = path.join(organizationsDir, 'documents');

[uploadsDir, organizationsDir, logosDir, documentsDir].forEach(dir => {
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

module.exports = {
  uploadLogo,
  uploadDocument,
  uploadMultipleDocuments,
  logosDir,
  documentsDir
};

