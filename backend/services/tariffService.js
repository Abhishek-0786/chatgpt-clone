const Tariff = require('../models/Tariff');
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
 * Generate unique tariffId
 */
function generateUniqueTariffId() {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TAR-${timestamp}-${randomStr}`;
}

/**
 * Get all tariffs with pagination and filters
 */
async function getAllTariffs(filters, pagination) {
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;
  const offset = (page - 1) * limit;
  const { search, status } = filters;

  // Build cache key with query params
  const cacheKey = `tariffs:list:page:${page}:limit:${limit}:search:${search || 'none'}:status:${status || 'all'}`;

  // Try to get from cache
  const cached = await cacheController.get(cacheKey);
  if (cached && cached.tariffs && cached.total !== undefined) {
    return cached;
  }

  // Build where clause
  const where = {
    deleted: false // Only show non-deleted tariffs
  };

  // Add search filter
  if (search) {
    where[Op.or] = [
      { tariffId: { [Op.iLike]: `%${search}%` } },
      { tariffName: { [Op.iLike]: `%${search}%` } }
    ];
  }

  // Add status filter
  if (status) {
    where.status = status;
  }

  // Get tariffs with pagination
  const { count, rows: tariffs } = await Tariff.findAndCountAll({
    where,
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });

  const totalPages = Math.ceil(count / limit);

  const formattedTariffs = tariffs.map(tariff => ({
    id: tariff.id,
    tariffId: tariff.tariffId,
    tariffName: tariff.tariffName,
    currency: tariff.currency,
    baseCharges: parseFloat(tariff.baseCharges),
    tax: parseFloat(tariff.tax),
    status: tariff.status,
    createdBy: tariff.createdBy,
    createdAt: tariff.createdAt
  }));

  const response = {
    tariffs: formattedTariffs,
    total: count,
    page,
    limit,
    totalPages
  };

  // Cache the response (store raw data, not formatted response)
  await cacheController.set(cacheKey, response, 300);

  return response;
}

/**
 * Get all active tariffs for dropdown (no pagination)
 */
async function getTariffsDropdown() {
  const tariffs = await Tariff.findAll({
    where: {
      deleted: false,
      status: 'Active'
    },
    attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax'],
    order: [['tariffName', 'ASC']]
  });

  return {
    tariffs: tariffs.map(tariff => ({
      id: tariff.id,
      tariffId: tariff.tariffId,
      tariffName: tariff.tariffName,
      baseCharges: parseFloat(tariff.baseCharges),
      tax: parseFloat(tariff.tax)
    }))
  };
}

/**
 * Get single tariff by tariffId
 */
async function getTariffById(tariffId) {
  const tariff = await Tariff.findOne({
    where: {
      tariffId,
      deleted: false
    }
  });

  if (!tariff) {
    return null;
  }

  return {
    id: tariff.id,
    tariffId: tariff.tariffId,
    tariffName: tariff.tariffName,
    currency: tariff.currency,
    baseCharges: parseFloat(tariff.baseCharges),
    tax: parseFloat(tariff.tax),
    status: tariff.status,
    createdBy: tariff.createdBy,
    createdAt: tariff.createdAt,
    updatedAt: tariff.updatedAt
  };
}

/**
 * Helper function to invalidate all tariffs list cache entries
 * This ensures the list is refreshed immediately after create/update/delete operations
 */
async function invalidateTariffsListCache() {
  try {
    // Get all cache keys matching the tariffs:list pattern
    const keys = await redisClient.keys('tariffs:list:*');
    if (keys && keys.length > 0) {
      await Promise.all(keys.map(key => cacheController.del(key)));
      console.log(`✅ [Cache] Invalidated ${keys.length} tariffs list cache entries`);
    }
  } catch (error) {
    console.warn('⚠️ [Cache] Failed to invalidate tariffs list cache:', error.message);
    // Don't fail the operation if cache invalidation fails
  }
}

/**
 * Create new tariff
 */
async function createTariff(tariffData) {
  const { tariffName, currency, baseCharges, tax, status, createdBy } = tariffData;

  // Generate unique tariffId (only tariffId needs to be unique, not tariffName)
  let tariffId;
  let existingTariff;
  do {
    tariffId = generateUniqueTariffId();
    existingTariff = await Tariff.findOne({ where: { tariffId } });
  } while (existingTariff); // Regenerate if exists (very unlikely, but just in case)

  // Create tariff
  const tariff = await Tariff.create({
    tariffId,
    tariffName,
    currency,
    baseCharges,
    tax,
    status: status || 'Active',
    createdBy: createdBy || null,
    deleted: false
  });

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.tariff.created',
        data: {
          tariffId: tariff.tariffId,
          id: tariff.id,
          tariffName: tariff.tariffName,
          createdBy: createdBy
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.tariff.created event for ${tariff.tariffId}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.tariff.created event:', rabbitmqError.message);
      // Don't fail the request if RabbitMQ fails
    }
  }

  // Invalidate tariffs list cache so the new tariff appears immediately
  await invalidateTariffsListCache();

  return {
    id: tariff.id,
    tariffId: tariff.tariffId,
    tariffName: tariff.tariffName,
    currency: tariff.currency,
    baseCharges: parseFloat(tariff.baseCharges),
    tax: parseFloat(tariff.tax),
    status: tariff.status,
    createdBy: tariff.createdBy,
    createdAt: tariff.createdAt
  };
}

/**
 * Update tariff
 */
async function updateTariff(tariffId, updateData) {
  // Find tariff
  const tariff = await Tariff.findOne({
    where: {
      tariffId,
      deleted: false
    }
  });

  if (!tariff) {
    return {
      success: false,
      error: 'Tariff not found'
    };
  }

  // Update tariff (tariffName can be duplicate, only tariffId is unique)
  await tariff.update(updateData);

  // Reload to get updated data
  await tariff.reload();

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.tariff.updated',
        data: {
          tariffId: tariff.tariffId,
          id: tariff.id,
          tariffName: tariff.tariffName
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.tariff.updated event for ${tariff.tariffId}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.tariff.updated event:', rabbitmqError.message);
      // Don't fail the request if RabbitMQ fails
    }
  }

  // Invalidate tariffs list cache so the updated tariff appears immediately
  await invalidateTariffsListCache();

  return {
    id: tariff.id,
    tariffId: tariff.tariffId,
    tariffName: tariff.tariffName,
    currency: tariff.currency,
    baseCharges: parseFloat(tariff.baseCharges),
    tax: parseFloat(tariff.tax),
    status: tariff.status,
    createdBy: tariff.createdBy,
    createdAt: tariff.createdAt,
    updatedAt: tariff.updatedAt
  };
}

/**
 * Soft delete tariff (set deleted = true)
 */
async function deleteTariff(tariffId) {
  // Find tariff
  const tariff = await Tariff.findOne({
    where: {
      tariffId,
      deleted: false
    }
  });

  if (!tariff) {
    return null;
  }

  // Soft delete
  await tariff.update({ deleted: true });

  // Invalidate tariffs list cache so the deleted tariff disappears immediately
  await invalidateTariffsListCache();

  return {
    tariffId: tariff.tariffId
  };
}

module.exports = {
  getAllTariffs,
  getTariffsDropdown,
  getTariffById,
  createTariff,
  updateTariff,
  deleteTariff,
  generateUniqueTariffId
};

