'use strict';

/**
 * P3-026: MCP Planning Tools Contract
 * 
 * Registered tools:
 * - civitas.planning.plans.search
 * - civitas.planning.plans.read
 * - civitas.planning.roadmaps.read
 * - civitas.planning.plans.validate
 * 
 * All tools:
 * - Use closed/bounded schemas
 * - Enforce cursor/output limits
 * - Reconcile org from principal.tenantId (never from input)
 * - Call PlanningRemoteApplicationPort (same as REST)
 * - Include module availability checks
 * - Are strictly read-only (validate is read-only validation)
 */

const PLANNING_TOOL_MANIFEST_VERSION = 'civitas-mcp-planning-tools/v1';
const PLANNING_MODULE_ID = 'planning';

const TOOL_STATUSES = Object.freeze(['draft', 'review', 'approved', 'planned', 'active', 'deprecated', 'removed']);
const RISK_LEVELS = Object.freeze(['R0', 'R1', 'R2']);
const EFFECTS = Object.freeze(['read', 'write', 'export', 'bulk', 'delete']);

// Closed input schemas - no arbitrary patterns that could encode SQL/URLs
const SCHEMAS = Object.freeze({
  // plans.search: Paginated search with bounded filters
  plansSearchInput: {
    type: 'object',
    additionalProperties: false,
    properties: {
      cursor: { type: 'string', maxLength: 512 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      status: { enum: ['draft', 'in_review', 'changes_requested', 'approved', 'archived'] },
      planType: { enum: ['strategic', 'tactical', 'operational', 'project', 'curriculum'] },
      titleQuery: { type: 'string', minLength: 1, maxLength: 160 }
    }
  },
  
  // plans.read: Single plan by ID
  plansReadInput: {
    type: 'object',
    required: ['planId'],
    additionalProperties: false,
    properties: {
      planId: { type: 'string', minLength: 1, maxLength: 128, pattern: /^[A-Za-z0-9_-]+$/ }
    }
  },
  
  // roadmaps.read: Roadmap by ID or list
  roadmapsReadInput: {
    type: 'object',
    additionalProperties: false,
    properties: {
      roadmapId: { type: 'string', minLength: 1, maxLength: 128, pattern: /^[A-Za-z0-9_-]+$/ },
      cursor: { type: 'string', maxLength: 512 },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    }
  },
  
  // plans.validate: Read-only validation of plan structure
  plansValidateInput: {
    type: 'object',
    required: ['planId'],
    additionalProperties: false,
    properties: {
      planId: { type: 'string', minLength: 1, maxLength: 128, pattern: /^[A-Za-z0-9_-]+$/ },
      validateReferences: { type: 'boolean' }
    }
  },
  
  // Output schemas with size limits
  planOutput: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      organizationId: { type: 'string' },
      title: { type: 'string', maxLength: 160 },
      planType: { type: 'string' },
      description: { type: ['string', 'null'], maxLength: 4000 },
      status: { type: 'string' },
      version: { type: 'string' },
      createdAt: { type: 'string' },
      updatedAt: { type: 'string' },
      createdBy: { type: 'string' },
      updatedBy: { type: 'string' }
    }
  },
  
  pageOutput: {
    type: 'object',
    properties: {
      items: { type: 'array' },
      cursor: { type: ['string', 'null'] },
      hasMore: { type: 'boolean' },
      totalCount: { type: 'integer' }
    }
  },
  
  validationOutput: {
    type: 'object',
    properties: {
      planId: { type: 'string' },
      valid: { type: 'boolean' },
      errors: { type: 'array', items: { type: 'object' } },
      warnings: { type: 'array', items: { type: 'object' } },
      validatedAt: { type: 'string' }
    }
  },
  
  roadmapOutput: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      organizationId: { type: 'string' },
      name: { type: 'string', maxLength: 160 },
      description: { type: ['string', 'null'], maxLength: 4000 },
      phases: { type: 'array' },
      createdAt: { type: 'string' },
      updatedAt: { type: 'string' }
    }
  }
});

// Tool definitions with canonical permissions and policies
const TOOLS = Object.freeze([
  {
    toolId: 'civitas.planning.plans.search',
    version: '1.0.0',
    moduleId: PLANNING_MODULE_ID,
    capabilityId: 'planning.plans',
    operationId: 'planning.plans.list',
    applicationServiceId: 'planning.listPlans',
    permissionId: 'planning.plans.read',
    policies: ['same-organization', 'membership-required'],
    dataScope: 'organization',
    risk: 'R0',
    effect: 'read',
    idempotency: 'forbidden',
    ifMatch: 'none',
    makerChecker: false,
    status: 'active',
    inputSchema: SCHEMAS.plansSearchInput,
    outputSchema: SCHEMAS.pageOutput,
    pagination: { maxLimit: 100, defaultLimit: 20 },
    outputLimits: { maxSizeBytes: 65536 },
    description: 'Search and list plans within the organization with pagination and filters',
    readOnly: true
  },
  {
    toolId: 'civitas.planning.plans.read',
    version: '1.0.0',
    moduleId: PLANNING_MODULE_ID,
    capabilityId: 'planning.plans',
    operationId: 'planning.plans.read',
    applicationServiceId: 'planning.readPlan',
    permissionId: 'planning.plans.read',
    policies: ['same-organization', 'membership-required'],
    dataScope: 'organization',
    risk: 'R0',
    effect: 'read',
    idempotency: 'forbidden',
    ifMatch: 'none',
    makerChecker: false,
    status: 'active',
    inputSchema: SCHEMAS.plansReadInput,
    outputSchema: SCHEMAS.planOutput,
    pagination: null,
    outputLimits: { maxSizeBytes: 32768 },
    description: 'Read a single plan by ID within the organization',
    readOnly: true
  },
  {
    toolId: 'civitas.planning.roadmaps.read',
    version: '1.0.0',
    moduleId: PLANNING_MODULE_ID,
    capabilityId: 'planning.roadmaps',
    operationId: 'planning.roadmaps.read',
    applicationServiceId: 'planning.readRoadmap',
    permissionId: 'planning.roadmaps.read',
    policies: ['same-organization', 'membership-required'],
    dataScope: 'organization',
    risk: 'R0',
    effect: 'read',
    idempotency: 'forbidden',
    ifMatch: 'none',
    makerChecker: false,
    status: 'active',
    inputSchema: SCHEMAS.roadmapsReadInput,
    outputSchema: SCHEMAS.roadmapOutput,
    pagination: { maxLimit: 100, defaultLimit: 20 },
    outputLimits: { maxSizeBytes: 65536 },
    description: 'Read roadmap(s) within the organization',
    readOnly: true
  },
  {
    toolId: 'civitas.planning.plans.validate',
    version: '1.0.0',
    moduleId: PLANNING_MODULE_ID,
    capabilityId: 'planning.plans',
    operationId: 'planning.plans.validate',
    applicationServiceId: 'planning.validatePlan',
    permissionId: 'planning.plans.read',
    policies: ['same-organization', 'membership-required'],
    dataScope: 'organization',
    risk: 'R0',
    effect: 'read',
    idempotency: 'forbidden',
    ifMatch: 'none',
    makerChecker: false,
    status: 'active',
    inputSchema: SCHEMAS.plansValidateInput,
    outputSchema: SCHEMAS.validationOutput,
    pagination: null,
    outputLimits: { maxSizeBytes: 16384 },
    description: 'Read-only validation of plan structure and references (does not mutate)',
    readOnly: true
  }
]);

// Prohibited patterns in input - structural rejection
const PROHIBITED_INPUT_PATTERNS = Object.freeze([
  /(?:^|;|\s)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\s/i, // SQL
  /(?:javascript|data|vbscript):/i, // URL schemes
  /<\s*script/i, // HTML script tags
  /\bfile:\/\/|\/\/\/|[\/\\]{2,}/, // File paths
  /\b(exec|eval|system|passthru|shell_exec)\s*\(/i, // Code execution
  /\b(require|include|import)\s*[\(]/i, // Code inclusion
  /\{\{.*\}\}|\$\{.*\}/, // Template injection
  /\.\.[\/\\]/, // Path traversal
]);

function validateInput(schema, input) {
  const errors = [];
  
  // Type checking
  if (schema.type === 'object') {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      errors.push({ field: 'root', code: 'type_object_required' });
      return errors;
    }
    
    // Required fields
    for (const field of schema.required || []) {
      if (input[field] === undefined) {
        errors.push({ field, code: 'required' });
      }
    }
    
    // Additional properties check
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(input)) {
        if (!schema.properties?.[key]) {
          errors.push({ field: key, code: 'additionalProperty_not_allowed' });
        }
      }
    }
    
    // Property validation
    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      if (input[key] !== undefined) {
        errors.push(...validateProperty(propSchema, input[key], key));
      }
    }
  }
  
  return errors;
}

function validateProperty(schema, value, path) {
  const errors = [];
  
  // Type check
  const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  
  if (schema.type && !expectedTypes.includes(actualType)) {
    // Special case: integer type accepts numbers that are integers
    if (schema.type === 'integer' && typeof value === 'number' && Number.isInteger(value)) {
      // Valid integer number, continue validation
    } else {
      errors.push({ field: path, code: `type_${expectedTypes.join('_or_')}_required` });
      return errors;
    }
  }
  
  // String validations
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ field: path, code: 'minLength' });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ field: path, code: 'maxLength' });
    }
    if (schema.pattern && !schema.pattern.test(value)) {
      errors.push({ field: path, code: 'pattern' });
    }
    
    // Check for prohibited patterns
    for (const pattern of PROHIBITED_INPUT_PATTERNS) {
      if (pattern.test(value)) {
        errors.push({ field: path, code: 'prohibited_pattern_detected', security: true });
        break;
      }
    }
  }
  
  // Number validations
  if (typeof value === 'number') {
    if (schema.type === 'integer' && !Number.isInteger(value)) {
      errors.push({ field: path, code: 'integer_required' });
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ field: path, code: 'minimum' });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ field: path, code: 'maximum' });
    }
  }
  
  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ field: path, code: 'enum' });
  }
  
  // Array validations
  if (Array.isArray(value)) {
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateProperty(schema.items, item, `${path}[${index}]`));
      });
    }
  }
  
  return errors;
}

function createPlanningToolManifest() {
  return Object.freeze({
    schemaVersion: PLANNING_TOOL_MANIFEST_VERSION,
    moduleId: PLANNING_MODULE_ID,
    gateEvidence: {
      applicationServices: TOOLS.map(t => t.applicationServiceId),
      issue188: 'P3-026-planning-mcp-tools',
      parityWithREST: true
    },
    confirmationPolicyVersion: 'civitas.confirmation/v1',
    tools: TOOLS,
    runtimeControls: {
      timeoutMs: 5000,
      maxConcurrentPerTenant: 100,
      maxOutputSizeBytes: 65536
    },
    prohibitedCapabilities: [
      'execute_sql', 'run_query', 'database_command',
      'call_provider', 'invoke_stripe', 'send_twilio',
      'fetch_url', 'http_request', 'webhook_call',
      'any_operation', 'dynamic_action', 'prompt_defined_tool'
    ]
  });
}

module.exports = {
  PLANNING_TOOL_MANIFEST_VERSION,
  PLANNING_MODULE_ID,
  TOOL_STATUSES,
  RISK_LEVELS,
  EFFECTS,
  SCHEMAS,
  TOOLS,
  PROHIBITED_INPUT_PATTERNS,
  validateInput,
  validateProperty,
  createPlanningToolManifest
};
