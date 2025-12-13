const cmsStationService = require('../services/cmsStationService');

/**
 * Get all stations with pagination and filters
 */
exports.getAllStations = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      status: req.query.status,
      organization: req.query.organization
    };
    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10
    };

    const result = await cmsStationService.getAllStations(filters, pagination);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stations'
    });
  }
};

/**
 * Get all active stations for dropdown (no pagination)
 */
exports.getStationsDropdown = async (req, res) => {
  try {
    const result = await cmsStationService.getStationsDropdown();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching stations for dropdown:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stations'
    });
  }
};

/**
 * Get single station by stationId
 */
exports.getStationById = async (req, res) => {
  try {
    const { stationId } = req.params;
    const result = await cmsStationService.getStationById(stationId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch station'
    });
  }
};

/**
 * Create new station
 */
exports.createStation = async (req, res) => {
  try {
    // Handle gallery images from FormData
    const galleryImages = [];
    if (req.files && Array.isArray(req.files)) {
      // Process gallery image files
      const galleryFiles = req.files.filter(f => f.fieldname && f.fieldname.includes('galleryImages'));
      const galleryData = {};
      
      // Group files by index
      galleryFiles.forEach(file => {
        const match = file.fieldname.match(/galleryImages\[(\d+)\]\[file\]/);
        if (match) {
          const index = match[1];
          if (!galleryData[index]) {
            galleryData[index] = {};
          }
          galleryData[index].file = file;
        }
      });
      
      // Get gallery image names from body
      Object.keys(req.body).forEach(key => {
        const match = key.match(/galleryImages\[(\d+)\]\[name\]/);
        if (match) {
          const index = match[1];
          if (!galleryData[index]) {
            galleryData[index] = {};
          }
          galleryData[index].name = req.body[key];
        }
      });
      
      // Build gallery images array
      Object.keys(galleryData).forEach(index => {
        const img = galleryData[index];
        if (img.file) {
          // Use provided name or generate from filename
          const imageName = img.name || img.file.originalname.replace(/\.[^/.]+$/, '') || `Image ${index}`;
          galleryImages.push({
            name: imageName,
            path: `/uploads/stations/gallery/${img.file.filename}`,
            date: new Date().toLocaleDateString()
          });
        }
      });
    }
    
    // Parse FormData fields
    const stationData = {
      stationName: req.body.stationName,
      organization: req.body.organization,
      organizationId: req.body.organizationId ? parseInt(req.body.organizationId) : null,
      status: req.body.status,
      powerCapacity: req.body.powerCapacity ? parseFloat(req.body.powerCapacity) : null,
      gridPhase: req.body.gridPhase,
      pinCode: req.body.pinCode || null,
      city: req.body.city || null,
      state: req.body.state || null,
      country: req.body.country,
      latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
      longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
      fullAddress: req.body.fullAddress || null,
      openingTime: req.body.openingTime || null,
      closingTime: req.body.closingTime || null,
      open24Hours: req.body.open24Hours === 'true' || req.body.open24Hours === true,
      workingDays: req.body['workingDays[]'] ? (Array.isArray(req.body['workingDays[]']) ? req.body['workingDays[]'] : [req.body['workingDays[]']]) : (req.body.workingDays || []),
      allDays: req.body.allDays === 'true' || req.body.allDays === true,
      contactNumber: req.body.contactNumber || null,
      inchargeName: req.body.inchargeName || null,
      ownerName: req.body.ownerName || null,
      ownerContact: req.body.ownerContact || null,
      sessionStartStopSMS: req.body.sessionStartStopSMS === 'true' || req.body.sessionStartStopSMS === true,
      amenities: req.body['amenities[]'] ? (Array.isArray(req.body['amenities[]']) ? req.body['amenities[]'] : [req.body['amenities[]']]) : (req.body.amenities || []),
      createdBy: req.body.createdBy || null,
      galleryImages: galleryImages
    };
    
    const result = await cmsStationService.createStation(stationData);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create station',
      error: error.message
    });
  }
};

/**
 * Update station
 */
exports.updateStation = async (req, res) => {
  try {
    const { stationId } = req.params;
    
    // Handle gallery images from FormData
    let galleryImages = undefined;
    
    // Check if gallery images should be cleared
    if (req.body && req.body.clearGalleryImages === 'true') {
      galleryImages = []; // Set to empty array to clear all images
      console.log('Gallery images clearance requested');
    } else {
      // Check if any gallery image fields are present in the request
      const galleryFiles = req.files && Array.isArray(req.files) 
        ? req.files.filter(f => 
            f.fieldname && 
            f.fieldname.includes('galleryImages')
          )
        : [];
      
      const hasGalleryFields = galleryFiles.length > 0 || 
                                (req.body && Object.keys(req.body).some(key => key.startsWith('galleryImages')));
      
      if (hasGalleryFields) {
        const galleryData = {};
        
        // Group files by index
        galleryFiles.forEach(file => {
          const match = file.fieldname.match(/galleryImages\[(\d+)\]\[file\]/);
          if (match) {
            const index = match[1];
            if (!galleryData[index]) {
              galleryData[index] = {};
            }
            galleryData[index].file = file;
          }
        });
        
        // Get gallery image names and paths from body
        if (req.body) {
          Object.keys(req.body).forEach(key => {
            const nameMatch = key.match(/galleryImages\[(\d+)\]\[name\]/);
            const pathMatch = key.match(/galleryImages\[(\d+)\]\[path\]/);
            if (nameMatch) {
              const index = nameMatch[1];
              if (!galleryData[index]) {
                galleryData[index] = {};
              }
              galleryData[index].name = req.body[key];
            } else if (pathMatch) {
              const index = pathMatch[1];
              if (!galleryData[index]) {
                galleryData[index] = {};
              }
              galleryData[index].path = req.body[key];
            }
          });
        }
        
        // Build gallery images array from all gallery data
        galleryImages = [];
        Object.keys(galleryData).sort((a, b) => parseInt(a) - parseInt(b)).forEach(index => {
          const img = galleryData[index];
          if (img.file) {
            // New file uploaded
            const imgName = img.name || img.file.originalname || `Image ${index}`;
            galleryImages.push({
              name: imgName,
              path: `/uploads/stations/gallery/${img.file.filename}`,
              date: new Date().toLocaleDateString()
            });
          } else if (img.path) {
            // Existing image (no new file, just keeping it)
            // Use provided name or generate from path
            const imageName = img.name || img.path.split('/').pop().replace(/\.[^/.]+$/, '') || `Image ${index}`;
            galleryImages.push({
              name: imageName,
              path: img.path,
              date: img.date || new Date().toLocaleDateString()
            });
          }
        });
      }
    }
    
    // Parse FormData fields
    const updateData = {
      stationName: req.body.stationName,
      organization: req.body.organization,
      organizationId: req.body.organizationId ? parseInt(req.body.organizationId) : null,
      status: req.body.status,
      powerCapacity: req.body.powerCapacity ? parseFloat(req.body.powerCapacity) : null,
      gridPhase: req.body.gridPhase,
      pinCode: req.body.pinCode || null,
      city: req.body.city || null,
      state: req.body.state || null,
      country: req.body.country,
      latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
      longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
      fullAddress: req.body.fullAddress || null,
      openingTime: req.body.openingTime || null,
      closingTime: req.body.closingTime || null,
      open24Hours: req.body.open24Hours === 'true' || req.body.open24Hours === true,
      workingDays: req.body['workingDays[]'] ? (Array.isArray(req.body['workingDays[]']) ? req.body['workingDays[]'] : [req.body['workingDays[]']]) : (req.body.workingDays || []),
      allDays: req.body.allDays === 'true' || req.body.allDays === true,
      contactNumber: req.body.contactNumber || null,
      inchargeName: req.body.inchargeName || null,
      ownerName: req.body.ownerName || null,
      ownerContact: req.body.ownerContact || null,
      sessionStartStopSMS: req.body.sessionStartStopSMS === 'true' || req.body.sessionStartStopSMS === true,
      amenities: req.body['amenities[]'] ? (Array.isArray(req.body['amenities[]']) ? req.body['amenities[]'] : [req.body['amenities[]']]) : (req.body.amenities || []),
      galleryImages: galleryImages
    };
    
    const result = await cmsStationService.updateStation(stationId, updateData);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error updating station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update station',
      error: error.message
    });
  }
};

/**
 * Delete station (soft delete)
 */
exports.deleteStation = async (req, res) => {
  try {
    const { stationId } = req.params;
    const result = await cmsStationService.deleteStation(stationId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error deleting station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete station'
    });
  }
};

