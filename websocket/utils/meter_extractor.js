/**
 * Meter Value Extractor
 * Utility to extract energy values from MeterValues OCPP messages
 */

/**
 * Extract energy value from MeterValues OCPP message
 * @param {Object} meterValuesLog - Object with messageData containing MeterValues
 * @returns {number|null} Energy value in Wh, or null if not found
 */
function extractMeterValue(meterValuesLog) {
  if (!meterValuesLog || !meterValuesLog.messageData) {
    return null;
  }

  const messageData = meterValuesLog.messageData;
  const meterValue = Array.isArray(messageData.meterValue) 
    ? messageData.meterValue 
    : (messageData.meterValue ? [messageData.meterValue] : []);

  if (meterValue.length === 0) {
    return null;
  }

  // Get sampled values from first meterValue entry
  const sampledValues = Array.isArray(meterValue[0]?.sampledValue)
    ? meterValue[0].sampledValue
    : (meterValue[0]?.sampledValue ? [meterValue[0].sampledValue] : []);

  if (sampledValues.length === 0) {
    return null;
  }

  // Find Energy.Active.Import.Register
  const energySample = sampledValues.find(sample => 
    sample.measurand === 'Energy.Active.Import.Register' || 
    sample.measurand === 'energy' ||
    sample.measurand === 'Energy'
  );

  if (energySample && energySample.value) {
    return parseFloat(energySample.value);
  }

  return null;
}

module.exports = {
  extractMeterValue
};

