const organizationService = require('../services/organizationService');

/**
 * Get all organizations with pagination and filters
 */
exports.getAllOrganizations = async (req, res) => {
  try {
    const filters = {
      search: req.query.search || '',
      sort: req.query.sort || '',
      fromDate: req.query.fromDate || '',
      toDate: req.query.toDate || ''
    };

    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10
    };

    const result = await organizationService.getAllOrganizations(filters, pagination);
    
    if (!result || !result.organizations) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch organizations',
        error: 'Invalid response from service'
      });
    }
    
    res.status(200).json({
      success: true,
      organizations: result.organizations,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch organizations',
      error: error.message
    });
  }
};

/**
 * Get all organizations for dropdown
 */
exports.getOrganizationsDropdown = async (req, res) => {
  try {
    const result = await organizationService.getOrganizationsDropdown();
    
    if (!result || !result.organizations) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch organizations',
        error: 'Invalid response from service'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        organizations: result.organizations
      }
    });
  } catch (error) {
    console.error('Error fetching organizations for dropdown:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch organizations',
      error: error.message
    });
  }
};

/**
 * Get single organization by id
 */
exports.getOrganizationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Organization id is required'
      });
    }

    // Pass id as-is (could be organizationId string or numeric id)
    // Don't parse it here - let the service handle both cases
    const result = await organizationService.getOrganizationById(id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        organization: result
      }
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch organization',
      error: error.message
    });
  }
};

/**
 * Create new organization
 */
exports.createOrganization = async (req, res) => {
  try {
    const {
      organizationName,
      gstin,
      organizationType,
      contactNumber,
      countryCode,
      email,
      addressCountry,
      addressPinCode,
      addressCity,
      addressState,
      fullAddress,
      bankAccountNumber,
      ifscCode,
      billingSameAsCompany,
      billingCountry,
      billingPinCode,
      billingCity,
      billingState,
      billingFullAddress
    } = req.body;

    if (!organizationName || organizationName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Organization name is required'
      });
    }

    // Handle logo file
    let organizationLogo = null;
    if (req.file) {
      // Logo file path relative to public folder
      organizationLogo = `/uploads/organizations/logos/${req.file.filename}`;
    }

    // Handle documents
    const documents = [];
    if (req.files && Array.isArray(req.files)) {
      // Process document files
      const documentFiles = req.files.filter(f => f.fieldname && f.fieldname.startsWith('documents'));
      const documentData = {};
      
      // Group files by index
      documentFiles.forEach(file => {
        const match = file.fieldname.match(/documents\[(\d+)\]\[file\]/);
        if (match) {
          const index = match[1];
          if (!documentData[index]) {
            documentData[index] = {};
          }
          documentData[index].file = file;
        }
      });
      
      // Get document names from body
      Object.keys(req.body).forEach(key => {
        const match = key.match(/documents\[(\d+)\]\[name\]/);
        if (match) {
          const index = match[1];
          if (!documentData[index]) {
            documentData[index] = {};
          }
          documentData[index].name = req.body[key];
        }
      });
      
      // Build documents array
      Object.keys(documentData).forEach(index => {
        const doc = documentData[index];
        if (doc.file && doc.name) {
          documents.push({
            name: doc.name,
            path: `/uploads/organizations/documents/${doc.file.filename}`,
            date: new Date().toLocaleDateString()
          });
        }
      });
    }

    const organizationData = {
      organizationName: organizationName.trim(),
      gstin: gstin || null,
      organizationType: organizationType || null,
      organizationLogo: organizationLogo,
      contactNumber: contactNumber || null,
      countryCode: countryCode || '+91',
      email: email || null,
      addressCountry: addressCountry || null,
      addressPinCode: addressPinCode || null,
      addressCity: addressCity || null,
      addressState: addressState || null,
      fullAddress: fullAddress || null,
      bankAccountNumber: bankAccountNumber || null,
      ifscCode: ifscCode || null,
      billingSameAsCompany: billingSameAsCompany === 'true' || billingSameAsCompany === true,
      billingCountry: billingCountry || null,
      billingPinCode: billingPinCode || null,
      billingCity: billingCity || null,
      billingState: billingState || null,
      billingFullAddress: billingFullAddress || null,
      documents: documents
    };

    const result = await organizationService.createOrganization(organizationData);
    
    if (!result) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create organization',
        error: 'Invalid response from service'
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      data: {
        organization: result
      }
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create organization',
      error: error.message
    });
  }
};

/**
 * Update organization
 */
exports.updateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate id parameter
    // organizationId can be either:
    // 1. A string organizationId (e.g., "ORG-1234567890-ABCDEF") - most common
    // 2. A numeric id (e.g., 1, 2, 3) - for backward compatibility
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({
        success: false,
        message: 'Organization ID is required'
      });
    }
    
    // Check if it's an empty string
    if (typeof id === 'string' && id.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Organization ID is required'
      });
    }
    
    // Pass it as-is to the service, which will handle both string and numeric IDs
    const organizationIdOrId = id;
    const {
      organizationName,
      gstin,
      organizationType,
      contactNumber,
      countryCode,
      email,
      addressCountry,
      addressPinCode,
      addressCity,
      addressState,
      fullAddress,
      bankAccountNumber,
      ifscCode,
      billingSameAsCompany,
      billingCountry,
      billingPinCode,
      billingCity,
      billingState,
      billingFullAddress
    } = req.body;

    if (!organizationName || organizationName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Organization name is required'
      });
    }

    // Handle logo file (only if new file uploaded) or removal
    // Check both req.file (single) and req.files (array) for logo
    let organizationLogo = undefined;
    
    // Check if logo should be removed
    if (req.body.removeLogo === 'true') {
      organizationLogo = null; // Set to null to remove logo
      console.log('Logo removal requested');
    } else {
      let logoFile = req.file;
      if (!logoFile && req.files && Array.isArray(req.files)) {
        logoFile = req.files.find(f => f.fieldname === 'organizationLogo');
      }
      if (logoFile) {
        organizationLogo = `/uploads/organizations/logos/${logoFile.filename}`;
        console.log('Logo file uploaded:', logoFile.filename, 'Path:', organizationLogo);
      } else {
        console.log('No logo file in request. req.file:', req.file, 'req.files:', req.files);
        // If no logo file and not explicitly removed, don't update logo field (keep existing)
        organizationLogo = undefined;
      }
    }

    // Handle documents - process all documents sent from frontend
    let documents = undefined;
    
    // Check if documents should be cleared
    if (req.body && req.body.clearDocuments === 'true') {
      documents = []; // Set to empty array to clear all documents
      console.log('Documents clearance requested');
    } else {
      // Check if any document fields are present in the request
      const documentFiles = req.files && Array.isArray(req.files) 
        ? req.files.filter(f => 
            f.fieldname && 
            f.fieldname.startsWith('documents') && 
            f.fieldname !== 'organizationLogo'
          )
        : [];
      
      const hasDocumentFields = documentFiles.length > 0 || 
                                (req.body && Object.keys(req.body).some(key => key.startsWith('documents')));
      
      console.log('Document files found:', documentFiles.length);
      console.log('Request body keys:', req.body ? Object.keys(req.body) : 'no body');
      console.log('Request body full:', JSON.stringify(req.body, null, 2));
      
      if (hasDocumentFields) {
      const documentData = {};
      
      // Group files by index
      documentFiles.forEach(file => {
        const match = file.fieldname.match(/documents\[(\d+)\]\[file\]/);
        if (match) {
          const index = match[1];
          if (!documentData[index]) {
            documentData[index] = {};
          }
          documentData[index].file = file;
          console.log(`Found document file at index ${index}:`, file.filename);
        }
      });
      
      // Get document names, paths, and dates from body
      // Multer should parse text fields into req.body, but nested brackets might be flattened
      // Check both req.body and req.body.documents if it exists
      if (req.body) {
        console.log('Scanning req.body for document fields...');
        console.log('All req.body keys:', Object.keys(req.body));
        
        // Try to parse nested structure if multer flattened it
        // Sometimes multer creates req.body['documents[0][name]'] instead of nested structure
        Object.keys(req.body).forEach(key => {
          console.log(`  Checking key: "${key}", value:`, req.body[key]);
          
          // Handle both formats: "documents[0][name]" and nested "documents[0][name]"
          const nameMatch = key.match(/documents\[(\d+)\]\[name\]/);
          const pathMatch = key.match(/documents\[(\d+)\]\[path\]/);
          const dateMatch = key.match(/documents\[(\d+)\]\[date\]/);
          
          if (nameMatch) {
            const index = nameMatch[1];
            if (!documentData[index]) {
              documentData[index] = {};
            }
            documentData[index].name = req.body[key];
            console.log(`✓ Found document name at index ${index}:`, req.body[key]);
          } else if (pathMatch) {
            const index = pathMatch[1];
            if (!documentData[index]) {
              documentData[index] = {};
            }
            documentData[index].path = req.body[key];
            console.log(`✓ Found document path at index ${index}:`, req.body[key]);
          } else if (dateMatch) {
            const index = dateMatch[1];
            if (!documentData[index]) {
              documentData[index] = {};
            }
            documentData[index].date = req.body[key];
            console.log(`✓ Found document date at index ${index}:`, req.body[key]);
          }
        });
        
        // Also check if documents is a nested object (unlikely with multer, but just in case)
        if (req.body.documents && typeof req.body.documents === 'object') {
          console.log('Found nested documents object in req.body');
          Object.keys(req.body.documents).forEach(index => {
            const doc = req.body.documents[index];
            if (doc && typeof doc === 'object') {
              if (!documentData[index]) {
                documentData[index] = {};
              }
              if (doc.name) documentData[index].name = doc.name;
              if (doc.path) documentData[index].path = doc.path;
              if (doc.date) documentData[index].date = doc.date;
            }
          });
        }
      }
      
      console.log('Document data after parsing:', JSON.stringify(documentData, null, 2));
      console.log('Document data indices found:', Object.keys(documentData));
      
      // Build documents array from all document data
      documents = [];
      const sortedIndices = Object.keys(documentData).sort((a, b) => parseInt(a) - parseInt(b));
      console.log('Processing documents in order:', sortedIndices);
      
      sortedIndices.forEach(index => {
        const doc = documentData[index];
        console.log(`Processing document at index ${index}:`, JSON.stringify(doc, null, 2));
        if (doc.file) {
          // New file uploaded - use file name as document name if name not provided
          const docName = doc.name || doc.file.originalname || `Document ${index}`;
          documents.push({
            name: docName,
            path: `/uploads/organizations/documents/${doc.file.filename}`,
            date: doc.date || new Date().toLocaleDateString()
          });
          console.log(`✓ Added new document at index ${index}:`, docName);
        } else if (doc.path && doc.name) {
          // Existing document (no new file, just keeping it)
          documents.push({
            name: doc.name,
            path: doc.path,
            date: doc.date || new Date().toLocaleDateString()
          });
          console.log(`✓ Added existing document at index ${index}:`, doc.name);
        } else {
          console.warn(`⚠ Skipping document at index ${index} - missing required fields:`, doc);
        }
      });
      
      console.log('Final documents array:', documents.length, documents);
      }
    }

    const updateData = {
      organizationName: organizationName.trim(),
      gstin: gstin,
      organizationType: organizationType,
      organizationLogo: organizationLogo,
      contactNumber: contactNumber,
      countryCode: countryCode,
      email: email,
      addressCountry: addressCountry,
      addressPinCode: addressPinCode,
      addressCity: addressCity,
      addressState: addressState,
      fullAddress: fullAddress,
      bankAccountNumber: bankAccountNumber,
      ifscCode: ifscCode,
      billingSameAsCompany: billingSameAsCompany === 'true' || billingSameAsCompany === true,
      billingCountry: billingCountry,
      billingPinCode: billingPinCode,
      billingCity: billingCity,
      billingState: billingState,
      billingFullAddress: billingFullAddress,
      documents: documents
    };

    const result = await organizationService.updateOrganization(organizationIdOrId, updateData);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }
    
    if (result.success === false) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to update organization'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Organization updated successfully',
      data: {
        organization: result
      }
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update organization',
      error: error.message
    });
  }
};

/**
 * Soft delete organization
 */
exports.deleteOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Organization id is required'
      });
    }

    const result = await organizationService.deleteOrganization(parseInt(id));
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Organization deleted successfully',
      data: {
        id: result.id
      }
    });
  } catch (error) {
    console.error('Error deleting organization:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete organization',
      error: error.message
    });
  }
};

/**
 * Get all stations for an organization
 */
exports.getOrganizationStations = async (req, res) => {
  try {
    const { id } = req.params;
    const filters = {
      search: req.query.search || '',
      status: req.query.status || '',
      fromDate: req.query.fromDate || '',
      toDate: req.query.toDate || '',
      sort: req.query.sort || ''
    };
    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10
    };

    // Pass id as-is (could be organizationId string or numeric id)
    // Don't parse it here - let the service handle both cases
    const result = await organizationService.getOrganizationStations(id, filters, pagination);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }
    
    res.status(200).json({
      success: true,
      stations: result.stations,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch (error) {
    console.error('Error fetching organization stations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch organization stations',
      error: error.message
    });
  }
};

/**
 * Get all sessions for an organization
 */
exports.getOrganizationSessions = async (req, res) => {
  try {
    const { id } = req.params;
    const type = req.query.type || 'completed'; // 'active' or 'completed'
    const filters = {
      search: req.query.search || '',
      fromDate: req.query.fromDate || '',
      toDate: req.query.toDate || ''
    };
    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10
    };

    // Pass id as-is (could be organizationId string or numeric id)
    // Don't parse it here - let the service handle both cases
    const result = await organizationService.getOrganizationSessions(id, type, filters, pagination);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }
    
    res.status(200).json({
      success: true,
      sessions: result.sessions,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch (error) {
    console.error('Error fetching organization sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch organization sessions',
      error: error.message
    });
  }
};

