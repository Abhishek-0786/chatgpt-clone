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
    const { organizationName } = req.body;

    if (!organizationName || organizationName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Organization name is required'
      });
    }

    const organizationData = {
      organizationName: organizationName.trim()
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
    const { organizationName } = req.body;

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

    const updateData = {
      organizationName: organizationName.trim()
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

