const { createPlanningLmsPort } = require('../../../application/lmsPort');
const { toMoodleCapabilityRequest, fromMoodleCapabilities, toMoodleHandoff, fromMoodleReceipt } = require('./mappings');

function createMoodlePlanningLmsAdapter({ client, token }) {
  if (!client || typeof client.capabilities !== 'function' || typeof client.publishCourse !== 'function') throw new TypeError('Moodle client is required');
  if (typeof token !== 'string' || !token) throw new TypeError('Moodle token is required');
  const authorization = { token };
  return createPlanningLmsPort({
    async negotiateCapabilities(request) { return fromMoodleCapabilities(await client.capabilities(toMoodleCapabilityRequest(request), authorization)); },
    async deliverHandoff(envelope, { negotiation } = {}) {
      if (!negotiation) throw new TypeError('Moodle capability negotiation is required');
      return fromMoodleReceipt(await client.publishCourse(toMoodleHandoff(envelope), authorization));
    },
  });
}

module.exports = { createMoodlePlanningLmsAdapter };
