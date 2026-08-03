'use strict';

/**
 * P3-029: Async IA Source Ingestion and Governed Reuse Contracts
 * 
 * This module defines the contracts for:
 * - Async source ingestion with file references
 * - Findings and suggestions/candidates ports
 * - Assistance and discovery ports
 * - Classification, provenance, license tracking
 * - Provider/model/version metadata
 * - Idempotent deduplication
 * - Human acceptance with If-Match/audit
 * 
 * NO model calls or ingestion implementation - contracts only.
 * Excludes graph/embeddings without separate contract.
 */

const crypto = require('node:crypto');

const P3029_CONTRACT_VERSION = 'civitas-p3-029/v1';
const IA_ARTIFACT_STATUSES = Object.freeze(['draft', 'pending_review', 'accepted', 'rejected', 'expired', 'deleted']);
const CLASSIFICATION_LEVELS = Object.freeze(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']);
const ARTIFACT_TYPES = Object.freeze(['source', 'prompt', 'response', 'finding', 'suggestion', 'candidate', 'generated_document', 'external_media']);

// ============================================================================
// SCHEMAS - Closed and bounded
// ============================================================================

const SCHEMAS = Object.freeze({
  // File reference for async ingestion
  fileReference: {
    type: 'object',
    required: ['fileId', 'organizationId', 'classification'],
    additionalProperties: false,
    properties: {
      fileId: { type: 'string', minLength: 1, maxLength: 128, pattern: /^[A-Za-z0-9_-]+$/ },
      organizationId: { type: 'string', minLength: 1, maxLength: 128 },
      classification: { enum: CLASSIFICATION_LEVELS },
      fileName: { type: 'string', minLength: 1, maxLength: 256 },
      mimeType: { type: 'string', maxLength: 128 },
      sizeBytes: { type: 'integer', minimum: 0 },
      contentHash: { type: 'string', minLength: 64, maxLength: 128, pattern: /^[a-f0-9]+$/ }, // SHA-256 hex
      encryptionKeyId: { type: 'string', minLength: 1, maxLength: 128 },
      legalHold: { type: 'boolean' }
    }
  },

  // Source ingestion request
  sourceIngestionRequest: {
    type: 'object',
    required: ['fileReference', 'artifactType', 'purpose'],
    additionalProperties: false,
    properties: {
      fileReference: { $ref: '#/definitions/fileReference' },
      artifactType: { enum: ARTIFACT_TYPES },
      purpose: { type: 'string', minLength: 1, maxLength: 512 }, // Human-readable purpose
      providerId: { type: 'string', minLength: 1, maxLength: 128 },
      providerModel: { type: 'string', minLength: 1, maxLength: 256 },
      providerVersion: { type: 'string', minLength: 1, maxLength: 128 },
      retentionDays: { type: 'integer', minimum: 1, maximum: 2555 }, // Max 7 years
      license: { type: 'string', minLength: 1, maxLength: 128 },
      metadata: {
        type: 'object',
        additionalProperties: { type: 'string', maxLength: 1024 },
        maxProperties: 20
      }
    }
  },

  // Finding result from IA analysis
  finding: {
    type: 'object',
    required: ['findingId', 'artifactId', 'severity', 'description'],
    additionalProperties: false,
    properties: {
      findingId: { type: 'string', minLength: 1, maxLength: 128 },
      artifactId: { type: 'string', minLength: 1, maxLength: 128 },
      severity: { enum: ['low', 'medium', 'high', 'critical'] },
      category: { type: 'string', minLength: 1, maxLength: 128 },
      description: { type: 'string', minLength: 1, maxLength: 4000 },
      evidence: { type: 'array', items: { type: 'string', maxLength: 1024 }, maxItems: 50 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      detectedAt: { type: 'string', format: 'date-time' },
      expiresAt: { type: 'string', format: 'date-time' }
    }
  },

  // Suggestion/candidate for human review
  suggestion: {
    type: 'object',
    required: ['suggestionId', 'artifactId', 'targetResourceId', 'proposedChanges'],
    additionalProperties: false,
    properties: {
      suggestionId: { type: 'string', minLength: 1, maxLength: 128 },
      artifactId: { type: 'string', minLength: 1, maxLength: 128 },
      targetResourceId: { type: 'string', minLength: 1, maxLength: 128 }, // e.g., plan_id
      targetResourceType: { type: 'string', minLength: 1, maxLength: 128 },
      proposedChanges: {
        type: 'object',
        additionalProperties: true,
        maxProperties: 100
      },
      rationale: { type: 'string', minLength: 1, maxLength: 4000 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      sources: { type: 'array', items: { type: 'string', maxLength: 256 }, maxItems: 20 },
      createdAt: { type: 'string', format: 'date-time' },
      expiresAt: { type: 'string', format: 'date-time' }
    }
  },

  // Human acceptance request with optimistic concurrency
  humanAcceptanceRequest: {
    type: 'object',
    required: ['artifactId', 'targetResourceId', 'ifMatch', 'decision'],
    additionalProperties: false,
    properties: {
      artifactId: { type: 'string', minLength: 1, maxLength: 128 },
      targetResourceId: { type: 'string', minLength: 1, maxLength: 128 },
      ifMatch: { type: 'string', minLength: 1, maxLength: 128 }, // Current version for optimistic concurrency
      decision: { enum: ['accept', 'reject', 'modify'] },
      proposedChanges: {
        type: 'object',
        additionalProperties: true,
        maxProperties: 100
      },
      rationale: { type: 'string', minLength: 1, maxLength: 4000 }
    }
  },

  // Provenance tracking
  provenance: {
    type: 'object',
    required: ['providerId', 'providerModel', 'ingestedAt'],
    additionalProperties: false,
    properties: {
      providerId: { type: 'string', minLength: 1, maxLength: 128 },
      providerModel: { type: 'string', minLength: 1, maxLength: 256 },
      providerVersion: { type: 'string', minLength: 1, maxLength: 128 },
      ingestedAt: { type: 'string', format: 'date-time' },
      ingestionRequestId: { type: 'string', minLength: 1, maxLength: 128 },
      sourceFileId: { type: 'string', minLength: 1, maxLength: 128 },
      license: { type: 'string', minLength: 1, maxLength: 128 },
      humanDecision: {
        type: 'object',
        properties: {
          decision: { enum: ['accept', 'reject', 'modify'] },
          decidedBy: { type: 'string', minLength: 1, maxLength: 128 },
          decidedAt: { type: 'string', format: 'date-time' },
          comparedVersion: { type: 'string', minLength: 1, maxLength: 128 },
          rationale: { type: 'string', minLength: 1, maxLength: 4000 }
        }
      }
    }
  },

  // IA artifact record
  iaArtifact: {
    type: 'object',
    required: ['artifactId', 'organizationId', 'artifactType', 'status', 'classification'],
    additionalProperties: false,
    properties: {
      artifactId: { type: 'string', minLength: 1, maxLength: 128 },
      organizationId: { type: 'string', minLength: 1, maxLength: 128 },
      artifactType: { enum: ARTIFACT_TYPES },
      status: { enum: IA_ARTIFACT_STATUSES },
      classification: { enum: CLASSIFICATION_LEVELS },
      fileReference: { $ref: '#/definitions/fileReference' },
      provenance: { $ref: '#/definitions/provenance' },
      retentionExpiresAt: { type: 'string', format: 'date-time' },
      legalHold: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  // Output schemas
  ingestionResponse: {
    type: 'object',
    properties: {
      artifactId: { type: 'string' },
      operationId: { type: 'string' },
      status: { type: 'string' },
      estimatedCompletionTime: { type: 'string', format: 'date-time' }
    }
  },

  findingsList: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { $ref: '#/definitions/finding' } },
      cursor: { type: ['string', 'null'] },
      hasMore: { type: 'boolean' },
      totalCount: { type: 'integer' }
    }
  },

  suggestionsList: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { $ref: '#/definitions/suggestion' } },
      cursor: { type: ['string', 'null'] },
      hasMore: { type: 'boolean' },
      totalCount: { type: 'integer' }
    }
  }
});

// ============================================================================
// PORT INTERFACES - Abstract contracts, no implementation
// ============================================================================

/**
 * IASourceIngestionPort - Async ingestion of files for IA processing
 */
const IASourceIngestionPort = Object.freeze({
  /**
   * @param {Object} request - sourceIngestionRequest schema
   * @param {Object} principal - authenticated principal with tenantId
   * @param {Object} context - correlationId, traceId, etc.
   * @returns {Promise<{artifactId: string, operationId: string}>}
   */
  ingestSource: async (request, principal, context) => {
    throw new Error('IASourceIngestionPort.ingestSource not implemented');
  },

  /**
   * @param {string} artifactId
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<Object>} - iaArtifact schema
   */
  getArtifactStatus: async (artifactId, principal, context) => {
    throw new Error('IASourceIngestionPort.getArtifactStatus not implemented');
  },

  /**
   * @param {string} artifactId
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<void>} - Marks for deletion per retention policy
   */
  requestDeletion: async (artifactId, principal, context) => {
    throw new Error('IASourceIngestionPort.requestDeletion not implemented');
  }
});

/**
 * IAFindingsPort - Query and manage findings from IA analysis
 */
const IAFindingsPort = Object.freeze({
  /**
   * @param {Object} query - { artifactId?, severity?, category?, cursor, limit }
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<Object>} - findingsList schema
   */
  listFindings: async (query, principal, context) => {
    throw new Error('IAFindingsPort.listFindings not implemented');
  },

  /**
   * @param {string} findingId
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<Object>} - finding schema
   */
  getFinding: async (findingId, principal, context) => {
    throw new Error('IAFindingsPort.getFinding not implemented');
  },

  /**
   * @param {string} findingId
   * @param {string} disposition - 'acknowledged', 'dismissed', 'remediated'
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<void>}
   */
  updateFindingDisposition: async (findingId, disposition, principal, context) => {
    throw new Error('IAFindingsPort.updateFindingDisposition not implemented');
  }
});

/**
 * IASuggestionsPort - Manage suggestions/candidates for human review
 */
const IASuggestionsPort = Object.freeze({
  /**
   * @param {Object} query - { artifactId?, targetResourceId?, status?, cursor, limit }
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<Object>} - suggestionsList schema
   */
  listSuggestions: async (query, principal, context) => {
    throw new Error('IASuggestionsPort.listSuggestions not implemented');
  },

  /**
   * @param {string} suggestionId
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<Object>} - suggestion schema
   */
  getSuggestion: async (suggestionId, principal, context) => {
    throw new Error('IASuggestionsPort.getSuggestion not implemented');
  },

  /**
   * @param {Object} request - humanAcceptanceRequest schema
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<Object>} - updated resource
   */
  submitHumanAcceptance: async (request, principal, context) => {
    throw new Error('IASuggestionsPort.submitHumanAcceptance not implemented');
  },

  /**
   * @param {string} suggestionId
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<void>} - Expires suggestion without action
   */
  expireSuggestion: async (suggestionId, principal, context) => {
    throw new Error('IASuggestionsPort.expireSuggestion not implemented');
  }
});

/**
 * IAAssistancePort - Discovery and assistance operations (read-only)
 */
const IAAssistancePort = Object.freeze({
  /**
   * @param {Object} query - { capabilityId, context?, cursor, limit }
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<Object>} - Available assistance capabilities
   */
  discoverCapabilities: async (query, principal, context) => {
    throw new Error('IAAssistancePort.discoverCapabilities not implemented');
  },

  /**
   * @param {Object} request - { capabilityId, inputSchema }
   * @param {Object} principal
   * @param {Object} context
   * @returns {Promise<Object>} - Assistance response (no canonical mutation)
   */
  requestAssistance: async (request, principal, context) => {
    throw new Error('IAAssistancePort.requestAssistance not implemented');
  }
});

// ============================================================================
// IDEMPOTENCY AND DEDUPLICATION
// ============================================================================

/**
 * Generates idempotency key for ingestion requests
 * @param {Object} request - sourceIngestionRequest
 * @param {string} organizationId - from principal
 * @returns {string} - Deterministic key
 */
function generateIdempotencyKey(request, organizationId) {
  const components = [
    organizationId,
    request.fileReference?.fileId,
    request.fileReference?.contentHash,
    request.artifactType,
    request.purpose,
    request.providerId,
    request.providerModel
  ].filter(Boolean);

  return crypto.createHash('sha256').update(components.join('|')).digest('hex');
}

/**
 * Validates classification inheritance
 * @param {Array<string>} sourceClassifications
 * @param {string} metadataClassification
 * @param {string} contextClassification
 * @returns {string} - Most restrictive classification
 */
function determineEffectiveClassification(sourceClassifications, metadataClassification = 'INTERNAL', contextClassification = 'INTERNAL') {
  const allClassifications = [...sourceClassifications, metadataClassification, contextClassification];

  if (allClassifications.includes('RESTRICTED')) return 'RESTRICTED';
  if (allClassifications.includes('CONFIDENTIAL')) return 'CONFIDENTIAL';
  if (allClassifications.includes('INTERNAL')) return 'INTERNAL';
  return 'PUBLIC';
}

// ============================================================================
// PROHIBITED PATTERNS
// ============================================================================

const PROHIBITED_INGESTION_PATTERNS = Object.freeze([
  /(?:^|;|\s)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\s/i, // SQL
  /(?:javascript|data|vbscript):/i, // URL schemes
  /<\s*script/i, // HTML script tags
  /\bfile:\/\/|\/\/\/|[\/\\]{2,}/, // File paths
  /\b(exec|eval|system|passthru|shell_exec)\s*\(/i, // Code execution
  /\.\.[\/\\]/, // Path traversal
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/, // Private keys
  /\b(?:password|secret|token|api_key|apikey)\s*[=:]\s*\S+/i // Credentials
]);

/**
 * Validates input against prohibited patterns
 * @param {string} value
 * @returns {boolean} - true if safe
 */
function validateNoProhibitedPatterns(value) {
  if (typeof value !== 'string') return true;
  return !PROHIBITED_INGESTION_PATTERNS.some(pattern => pattern.test(value));
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  P3029_CONTRACT_VERSION,
  IA_ARTIFACT_STATUSES,
  CLASSIFICATION_LEVELS,
  ARTIFACT_TYPES,
  SCHEMAS,
  IASourceIngestionPort,
  IAFindingsPort,
  IASuggestionsPort,
  IAAssistancePort,
  generateIdempotencyKey,
  determineEffectiveClassification,
  validateNoProhibitedPatterns,
  PROHIBITED_INGESTION_PATTERNS
};
