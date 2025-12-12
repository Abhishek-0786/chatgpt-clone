const organizationService = require('../services/organizationService');

/**
 * Get all organizations with pagination and filters
 */
exports.getAllOrganizations = async (req, res) => {
  try {
    const filters = {
      search: req.query.search || ''
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

    const result = await organizationService.getOrganizationById(parseInt(id));
    
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
      companyName,
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
      stripePublishableKey,
      stripeSecretKey,
      redirectUrl,
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
    let companyLogo = null;
    if (req.file) {
      // Logo file path relative to public folder
      companyLogo = `/uploads/organizations/logos/${req.file.filename}`;
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
      companyName: companyName || organizationName.trim(),
      gstin: gstin || null,
      organizationType: organizationType || null,
      companyLogo: companyLogo,
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
      stripePublishableKey: stripePublishableKey || null,
      stripeSecretKey: stripeSecretKey || null,
      redirectUrl: redirectUrl || null,
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
    const {
      organizationName,
      companyName,
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
      stripePublishableKey,
      stripeSecretKey,
      redirectUrl,
      billingSameAsCompany,
      billingCountry,
      billingPinCode,
      billingCity,
      billingState,
      billingFullAddress
    } = req.body;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Organization id is required'
      });
    }

    if (!organizationName || organizationName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Organization name is required'
      });
    }

    // Handle logo file (only if new file uploaded)
    let companyLogo = undefined;
    if (req.file) {
      companyLogo = `/uploads/organizations/logos/${req.file.filename}`;
    }

    // Handle documents
    let documents = undefined;
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
      
      // Get document names and paths from body
      Object.keys(req.body).forEach(key => {
        const nameMatch = key.match(/documents\[(\d+)\]\[name\]/);
        const pathMatch = key.match(/documents\[(\d+)\]\[path\]/);
        if (nameMatch) {
          const index = nameMatch[1];
          if (!documentData[index]) {
            documentData[index] = {};
          }
          documentData[index].name = req.body[key];
        } else if (pathMatch) {
          const index = pathMatch[1];
          if (!documentData[index]) {
            documentData[index] = {};
          }
          documentData[index].path = req.body[key];
        }
      });
      
      // Build documents array
      documents = [];
      Object.keys(documentData).forEach(index => {
        const doc = documentData[index];
        if (doc.file && doc.name) {
          // New file uploaded
          documents.push({
            name: doc.name,
            path: `/uploads/organizations/documents/${doc.file.filename}`,
            date: new Date().toLocaleDateString()
          });
        } else if (doc.path && doc.name) {
          // Existing document (no new file)
          documents.push({
            name: doc.name,
            path: doc.path,
            date: new Date().toLocaleDateString()
          });
        }
      });
    }

    const updateData = {
      organizationName: organizationName.trim(),
      companyName: companyName,
      gstin: gstin,
      organizationType: organizationType,
      companyLogo: companyLogo,
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
      stripePublishableKey: stripePublishableKey,
      stripeSecretKey: stripeSecretKey,
      redirectUrl: redirectUrl,
      billingSameAsCompany: billingSameAsCompany === 'true' || billingSameAsCompany === true,
      billingCountry: billingCountry,
      billingPinCode: billingPinCode,
      billingCity: billingCity,
      billingState: billingState,
      billingFullAddress: billingFullAddress,
      documents: documents
    };

    const result = await organizationService.updateOrganization(parseInt(id), updateData);
    
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

