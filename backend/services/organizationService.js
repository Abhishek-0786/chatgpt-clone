const { Organization, Station, ChargingPoint } = require('../models');
const { Op } = require('sequelize');
const cacheController = require('../libs/redis/cacheController');
const redisClient = require('../libs/redis/redisClient');

// RabbitMQ producer (optional - only if enabled)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let publishCMSEvent = null;
if (ENABLE_RABBITMQ) {
  try {
    const producer = require('../libs/rabbitmq/producer');
    publishCMSEvent = producer.publishCMSEvent;
  } catch (error) {
    console.warn('⚠️ RabbitMQ producer not available:', error.message);
  }
}

/**
 * Get all organizations with pagination and filters
 */
async function getAllOrganizations(filters, pagination) {
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;
  const offset = (page - 1) * limit;
  const { search } = filters;

  // Build cache key with query params
  const cacheKey = `organizations:list:page:${page}:limit:${limit}:search:${search || 'none'}`;

  // Try to get from cache
  const cached = await cacheController.get(cacheKey);
  if (cached && cached.organizations && cached.total !== undefined) {
    return cached;
  }

  // Build where clause
  const where = {
    deleted: false // Only show non-deleted organizations
  };

  // Add search filter
  if (search) {
    where[Op.or] = [
      { organizationName: { [Op.iLike]: `%${search}%` } }
    ];
  }

  // Get organizations with pagination
  const { count, rows: organizations } = await Organization.findAndCountAll({
    where,
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });

  // Get station and charger counts for each organization
  const organizationsWithCounts = await Promise.all(
    organizations.map(async (org) => {
      // Convert organization name to the format used in stations.organization field
      // e.g., "Massive Mobility" -> "massive_mobility"
      const orgNameForStation = org.organizationName.toLowerCase().replace(/\s+/g, '_');
      
      // Count stations by matching organization name (temporary until organizationId column is added)
      const stationCount = await Station.count({
        where: {
          organization: orgNameForStation,
          deleted: false
        }
      });

      // Count chargers (charging points) - get station IDs first, then count chargers
      const stations = await Station.findAll({
        where: {
          organization: orgNameForStation,
          deleted: false
        },
        attributes: ['id']
      });
      
      const stationIds = stations.map(s => s.id);
      let chargerCount = 0;
      if (stationIds.length > 0) {
        chargerCount = await ChargingPoint.count({
          include: [
            {
              model: Station,
              as: 'station',
              where: {
                id: { [Op.in]: stationIds },
                deleted: false
              },
              required: true
            }
          ]
        });
      }

      return {
        id: org.id,
        organizationName: org.organizationName,
        stations: stationCount,
        chargers: chargerCount,
        createdAt: org.createdAt
      };
    })
  );

  const totalPages = Math.ceil(count / limit);

  const response = {
    organizations: organizationsWithCounts,
    total: count,
    page,
    limit,
    totalPages
  };

  // Cache the response
  await cacheController.set(cacheKey, response, 300);

  return response;
}

/**
 * Get all organizations for dropdown (no pagination)
 */
async function getOrganizationsDropdown() {
  const organizations = await Organization.findAll({
    where: {
      deleted: false
    },
    attributes: ['id', 'organizationName'],
    order: [['organizationName', 'ASC']]
  });

  return {
    organizations: organizations.map(org => ({
      id: org.id,
      organizationName: org.organizationName
    }))
  };
}

/**
 * Get single organization by id
 */
async function getOrganizationById(id) {
  const organization = await Organization.findOne({
    where: {
      id,
      deleted: false
    }
  });

  if (!organization) {
    return null;
  }

  // Get counts - convert organization name to format used in stations.organization
  const orgNameForStation = organization.organizationName.toLowerCase().replace(/\s+/g, '_');
  
  const stationCount = await Station.count({
    where: {
      organization: orgNameForStation,
      deleted: false
    }
  });

  // Get station IDs first, then count chargers
  const stations = await Station.findAll({
    where: {
      organization: orgNameForStation,
      deleted: false
    },
    attributes: ['id']
  });
  
  const stationIds = stations.map(s => s.id);
  let chargerCount = 0;
  if (stationIds.length > 0) {
    chargerCount = await ChargingPoint.count({
      include: [
        {
          model: Station,
          as: 'station',
          where: {
            id: { [Op.in]: stationIds },
            deleted: false
          },
          required: true
        }
      ]
    });
  }

  // Return all organization fields
  return {
    id: organization.id,
    organizationName: organization.organizationName,
    gstin: organization.gstin,
    organizationType: organization.organizationType,
    organizationLogo: organization.organizationLogo,
    contactNumber: organization.contactNumber,
    countryCode: organization.countryCode,
    email: organization.email,
    addressCountry: organization.addressCountry,
    addressPinCode: organization.addressPinCode,
    addressCity: organization.addressCity,
    addressState: organization.addressState,
    fullAddress: organization.fullAddress,
    bankAccountNumber: organization.bankAccountNumber,
    ifscCode: organization.ifscCode,
    stripePublishableKey: organization.stripePublishableKey,
    stripeSecretKey: organization.stripeSecretKey,
    redirectUrl: organization.redirectUrl,
    billingSameAsCompany: organization.billingSameAsCompany,
    billingCountry: organization.billingCountry,
    billingPinCode: organization.billingPinCode,
    billingCity: organization.billingCity,
    billingState: organization.billingState,
    billingFullAddress: organization.billingFullAddress,
    documents: organization.documents || [],
    stations: stationCount,
    chargers: chargerCount,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt
  };
}

/**
 * Helper function to invalidate all organizations list cache entries
 */
async function invalidateOrganizationsListCache() {
  try {
    const keys = await redisClient.keys('organizations:list:*');
    if (keys && keys.length > 0) {
      await Promise.all(keys.map(key => cacheController.del(key)));
      console.log(`✅ [Cache] Invalidated ${keys.length} organizations list cache entries`);
    }
  } catch (error) {
    console.warn('⚠️ [Cache] Failed to invalidate organizations list cache:', error.message);
  }
}

/**
 * Create new organization
 */
async function createOrganization(organizationData) {
  const {
    organizationName,
    gstin,
    organizationType,
    organizationLogo,
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
    billingFullAddress,
    documents
  } = organizationData;

  // Check if organization with same name already exists
  const existingOrg = await Organization.findOne({
    where: {
      organizationName,
      deleted: false
    }
  });

  if (existingOrg) {
    throw new Error('Organization with this name already exists');
  }

  // Create organization with all fields
  const organization = await Organization.create({
    organizationName,
    gstin: gstin || null,
    organizationType: organizationType || null,
    organizationLogo: organizationLogo || null,
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
    billingSameAsCompany: billingSameAsCompany || false,
    billingCountry: billingCountry || null,
    billingPinCode: billingPinCode || null,
    billingCity: billingCity || null,
    billingState: billingState || null,
    billingFullAddress: billingFullAddress || null,
    documents: documents || [],
    deleted: false
  });

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.organization.created',
        data: {
          id: organization.id,
          organizationName: organization.organizationName
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.organization.created event for ${organization.id}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.organization.created event:', rabbitmqError.message);
    }
  }

  // Invalidate organizations list cache
  await invalidateOrganizationsListCache();

  return {
    id: organization.id,
    organizationName: organization.organizationName,
    stations: 0,
    chargers: 0,
    createdAt: organization.createdAt
  };
}

/**
 * Update organization
 */
async function updateOrganization(id, updateData) {
  const {
    organizationName,
    gstin,
    organizationType,
    organizationLogo,
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
    billingFullAddress,
    documents
  } = updateData;

  // Find organization
  const organization = await Organization.findOne({
    where: {
      id,
      deleted: false
    }
  });

  if (!organization) {
    return {
      success: false,
      error: 'Organization not found'
    };
  }

  // Check if another organization with same name exists
  if (organizationName && organizationName !== organization.organizationName) {
    const existingOrg = await Organization.findOne({
      where: {
        organizationName,
        deleted: false,
        id: { [Op.ne]: id }
      }
    });

    if (existingOrg) {
      return {
        success: false,
        error: 'Organization with this name already exists'
      };
    }
  }

  // Build update object with only provided fields
  const updateFields = {};
  if (organizationName !== undefined) updateFields.organizationName = organizationName;
  if (gstin !== undefined) updateFields.gstin = gstin;
  if (organizationType !== undefined) updateFields.organizationType = organizationType;
  if (organizationLogo !== undefined) updateFields.organizationLogo = organizationLogo;
  if (contactNumber !== undefined) updateFields.contactNumber = contactNumber;
  if (countryCode !== undefined) updateFields.countryCode = countryCode;
  if (email !== undefined) updateFields.email = email;
  if (addressCountry !== undefined) updateFields.addressCountry = addressCountry;
  if (addressPinCode !== undefined) updateFields.addressPinCode = addressPinCode;
  if (addressCity !== undefined) updateFields.addressCity = addressCity;
  if (addressState !== undefined) updateFields.addressState = addressState;
  if (fullAddress !== undefined) updateFields.fullAddress = fullAddress;
  if (bankAccountNumber !== undefined) updateFields.bankAccountNumber = bankAccountNumber;
  if (ifscCode !== undefined) updateFields.ifscCode = ifscCode;
  if (stripePublishableKey !== undefined) updateFields.stripePublishableKey = stripePublishableKey;
  if (stripeSecretKey !== undefined) updateFields.stripeSecretKey = stripeSecretKey;
  if (redirectUrl !== undefined) updateFields.redirectUrl = redirectUrl;
  if (billingSameAsCompany !== undefined) updateFields.billingSameAsCompany = billingSameAsCompany;
  if (billingCountry !== undefined) updateFields.billingCountry = billingCountry;
  if (billingPinCode !== undefined) updateFields.billingPinCode = billingPinCode;
  if (billingCity !== undefined) updateFields.billingCity = billingCity;
  if (billingState !== undefined) updateFields.billingState = billingState;
  if (billingFullAddress !== undefined) updateFields.billingFullAddress = billingFullAddress;
  if (documents !== undefined) updateFields.documents = documents;

  // Update organization
  await organization.update(updateFields);

  // Reload to get updated data
  await organization.reload();

  // Get counts - convert organization name to format used in stations.organization
  const orgNameForStation = organization.organizationName.toLowerCase().replace(/\s+/g, '_');
  
  const stationCount = await Station.count({
    where: {
      organization: orgNameForStation,
      deleted: false
    }
  });

  // Get station IDs first, then count chargers
  const stations = await Station.findAll({
    where: {
      organization: orgNameForStation,
      deleted: false
    },
    attributes: ['id']
  });
  
  const stationIds = stations.map(s => s.id);
  let chargerCount = 0;
  if (stationIds.length > 0) {
    chargerCount = await ChargingPoint.count({
      include: [
        {
          model: Station,
          as: 'station',
          where: {
            id: { [Op.in]: stationIds },
            deleted: false
          },
          required: true
        }
      ]
    });
  }

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.organization.updated',
        data: {
          id: organization.id,
          organizationName: organization.organizationName
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.organization.updated event for ${organization.id}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.organization.updated event:', rabbitmqError.message);
    }
  }

  // Invalidate organizations list cache
  await invalidateOrganizationsListCache();

  return {
    id: organization.id,
    organizationName: organization.organizationName,
    stations: stationCount,
    chargers: chargerCount,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt
  };
}

/**
 * Soft delete organization (set deleted = true)
 */
async function deleteOrganization(id) {
  // Find organization
  const organization = await Organization.findOne({
    where: {
      id,
      deleted: false
    }
  });

  if (!organization) {
    return null;
  }

  // Check if organization has stations - convert organization name to format used in stations.organization
  const orgNameForStation = organization.organizationName.toLowerCase().replace(/\s+/g, '_');
  
  const stationCount = await Station.count({
    where: {
      organization: orgNameForStation,
      deleted: false
    }
  });

  if (stationCount > 0) {
    throw new Error('Cannot delete organization with existing stations. Please remove or reassign stations first.');
  }

  // Soft delete
  await organization.update({ deleted: true });

  // Invalidate organizations list cache
  await invalidateOrganizationsListCache();

  return {
    id: organization.id
  };
}

module.exports = {
  getAllOrganizations,
  getOrganizationsDropdown,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  deleteOrganization
};

