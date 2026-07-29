function createProductionHandoffPort(candidate) {
  for (const method of ['deliver', 'lookupReceipt', 'cancel', 'rollback']) {
    if (typeof candidate?.[method] !== 'function') throw new TypeError(`ProductionHandoffPort.${method} is required`);
  }
  return Object.freeze(candidate);
}
module.exports = { createProductionHandoffPort };
