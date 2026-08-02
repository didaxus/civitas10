"use strict";

class PlanningPersistencePort {
  async findById(_organizationId, _planId, _options) { throw new Error("Not implemented"); }
  async save(_aggregate, _options) { throw new Error("Not implemented"); }
  async executeAtomically(_command) { throw new Error("Not implemented"); }
}

module.exports = { PlanningPersistencePort };
