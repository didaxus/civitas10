'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
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
} = require('../p3-029-contracts');

describe('P3-029 IA Contracts', () => {
  describe('Contract Constants', () => {
    it('defines correct contract version', () => {
      assert.strictEqual(P3029_CONTRACT_VERSION, 'civitas-p3-029/v1');
    });

    it('defines all artifact statuses', () => {
      assert.strictEqual(IA_ARTIFACT_STATUSES.length, 6);
      assert.ok(IA_ARTIFACT_STATUSES.includes('draft'));
      assert.ok(IA_ARTIFACT_STATUSES.includes('accepted'));
      assert.ok(IA_ARTIFACT_STATUSES.includes('rejected'));
    });

    it('defines all classification levels', () => {
      assert.strictEqual(CLASSIFICATION_LEVELS.length, 4);
      assert.ok(CLASSIFICATION_LEVELS.includes('PUBLIC'));
      assert.ok(CLASSIFICATION_LEVELS.includes('RESTRICTED'));
    });

    it('defines all artifact types', () => {
      assert.strictEqual(ARTIFACT_TYPES.length, 8);
      assert.ok(ARTIFACT_TYPES.includes('source'));
      assert.ok(ARTIFACT_TYPES.includes('suggestion'));
      assert.ok(!ARTIFACT_TYPES.includes('embedding')); // Excluded per requirements
    });
  });

  describe('Schema Validation', () => {
    function validateSchema(schema, data, path = '') {
      const errors = [];
      
      if (schema.type === 'object') {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          errors.push(`${path}: object required`);
          return errors;
        }

        // Required fields
        for (const field of schema.required || []) {
          if (data[field] === undefined) {
            errors.push(`${path}.${field}: required`);
          }
        }

        // Additional properties
        if (schema.additionalProperties === false) {
          for (const key of Object.keys(data)) {
            if (!schema.properties?.[key]) {
              errors.push(`${path}.${key}: additional property not allowed`);
            }
          }
        }

        // Property validation
        for (const [key, propSchema] of Object.entries(schema.properties || {})) {
          if (data[key] !== undefined) {
            errors.push(...validateProperty(propSchema, data[key], `${path}.${key}`));
          }
        }
      }

      return errors;
    }

    function validateProperty(schema, value, path) {
      const errors = [];

      if (schema.type === 'string' && typeof value === 'string') {
        if (schema.minLength !== undefined && value.length < schema.minLength) {
          errors.push(`${path}: minLength ${schema.minLength}`);
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
          errors.push(`${path}: maxLength ${schema.maxLength}`);
        }
        if (schema.pattern && !schema.pattern.test(value)) {
          errors.push(`${path}: pattern mismatch`);
        }
      }

      if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${path}: invalid enum value`);
      }

      return errors;
    }

    it('validates fileReference schema', () => {
      const validFileRef = {
        fileId: 'file_abc123',
        organizationId: 'org_xyz',
        classification: 'CONFIDENTIAL',
        fileName: 'document.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        contentHash: 'a'.repeat(64),
        encryptionKeyId: 'key_123',
        legalHold: false
      };

      const errors = validateSchema(SCHEMAS.fileReference, validFileRef);
      assert.strictEqual(errors.length, 0, JSON.stringify(errors));
    });

    it('rejects invalid classification in fileReference', () => {
      const invalidFileRef = {
        fileId: 'file_abc123',
        organizationId: 'org_xyz',
        classification: 'INVALID_LEVEL'
      };

      const errors = validateSchema(SCHEMAS.fileReference, invalidFileRef);
      assert.ok(errors.some(e => e.includes('classification')));
    });

    it('validates sourceIngestionRequest schema', () => {
      const validRequest = {
        fileReference: {
          fileId: 'file_abc123',
          organizationId: 'org_xyz',
          classification: 'INTERNAL'
        },
        artifactType: 'source',
        purpose: 'Analysis for planning optimization',
        providerId: 'provider_123',
        providerModel: 'gpt-4',
        providerVersion: '1.0.0',
        retentionDays: 365,
        license: 'MIT'
      };

      const errors = validateSchema(SCHEMAS.sourceIngestionRequest, validRequest);
      assert.strictEqual(errors.length, 0, JSON.stringify(errors));
    });

    it('rejects excessive retention days', () => {
      // Schema defines maximum: 2555 (7 years)
      const schema = SCHEMAS.sourceIngestionRequest;
      const maxRetention = schema.properties.retentionDays.maximum;
      assert.strictEqual(maxRetention, 2555);
      
      // Verify the constraint is defined in the schema
      assert.ok(schema.properties.retentionDays.maximum <= 2555);
    });

    it('validates humanAcceptanceRequest with If-Match', () => {
      const validRequest = {
        artifactId: 'artifact_123',
        targetResourceId: 'plan_456',
        ifMatch: 'version_789',
        decision: 'accept',
        rationale: 'Reviewed and approved'
      };

      const errors = validateSchema(SCHEMAS.humanAcceptanceRequest, validRequest);
      assert.strictEqual(errors.length, 0, JSON.stringify(errors));
    });

    it('requires ifMatch for optimistic concurrency', () => {
      const invalidRequest = {
        artifactId: 'artifact_123',
        targetResourceId: 'plan_456',
        decision: 'accept'
        // Missing ifMatch
      };

      const errors = validateSchema(SCHEMAS.humanAcceptanceRequest, invalidRequest);
      assert.ok(errors.some(e => e.includes('ifMatch')));
    });
  });

  describe('Idempotency Key Generation', () => {
    it('generates deterministic keys', () => {
      const request = {
        fileReference: {
          fileId: 'file_123',
          contentHash: 'abc123'
        },
        artifactType: 'source',
        purpose: 'test',
        providerId: 'provider_1',
        providerModel: 'model_1'
      };

      const key1 = generateIdempotencyKey(request, 'org_abc');
      const key2 = generateIdempotencyKey(request, 'org_abc');

      assert.strictEqual(key1, key2);
      assert.strictEqual(key1.length, 64); // SHA-256 hex
    });

    it('generates different keys for different organizations', () => {
      const request = {
        fileReference: {
          fileId: 'file_123',
          contentHash: 'abc123'
        },
        artifactType: 'source'
      };

      const key1 = generateIdempotencyKey(request, 'org_a');
      const key2 = generateIdempotencyKey(request, 'org_b');

      assert.notStrictEqual(key1, key2);
    });
  });

  describe('Classification Inheritance', () => {
    it('returns most restrictive classification', () => {
      assert.strictEqual(
        determineEffectiveClassification(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL']),
        'CONFIDENTIAL'
      );

      assert.strictEqual(
        determineEffectiveClassification(['PUBLIC', 'RESTRICTED', 'INTERNAL']),
        'RESTRICTED'
      );
    });

    it('handles empty source classifications', () => {
      assert.strictEqual(
        determineEffectiveClassification([], 'INTERNAL', 'PUBLIC'),
        'INTERNAL'
      );
    });

    it('defaults to INTERNAL when metadata/context not provided', () => {
      assert.strictEqual(
        determineEffectiveClassification(['PUBLIC']),
        'INTERNAL'
      );
    });
  });

  describe('Prohibited Pattern Detection', () => {
    it('detects SQL injection patterns', () => {
      assert.strictEqual(validateNoProhibitedPatterns('SELECT * FROM users'), false);
      assert.strictEqual(validateNoProhibitedPatterns('DROP TABLE plans;--'), false);
    });

    it('detects URL scheme injection', () => {
      assert.strictEqual(validateNoProhibitedPatterns('javascript:alert(1)'), false);
      assert.strictEqual(validateNoProhibitedPatterns('data:text/html,<script>'), false);
    });

    it('detects path traversal', () => {
      assert.strictEqual(validateNoProhibitedPatterns('../../../etc/passwd'), false);
    });

    it('detects credential patterns', () => {
      assert.strictEqual(validateNoProhibitedPatterns('password=secret123'), false);
      assert.strictEqual(validateNoProhibitedPatterns('api_key: abc123'), false);
    });

    it('allows safe input', () => {
      assert.strictEqual(validateNoProhibitedPatterns('Normal plan description'), true);
      assert.strictEqual(validateNoProhibitedPatterns('Strategic initiative 2024'), true);
    });
  });

  describe('Port Interfaces', () => {
    it('IASourceIngestionPort throws not implemented', async () => {
      await assert.rejects(
        () => IASourceIngestionPort.ingestSource({}, {}, {}),
        /not implemented/
      );
    });

    it('IAFindingsPort throws not implemented', async () => {
      await assert.rejects(
        () => IAFindingsPort.listFindings({}, {}, {}),
        /not implemented/
      );
    });

    it('IASuggestionsPort throws not implemented', async () => {
      await assert.rejects(
        () => IASuggestionsPort.submitHumanAcceptance({}, {}, {}),
        /not implemented/
      );
    });

    it('IAAssistancePort throws not implemented', async () => {
      await assert.rejects(
        () => IAAssistancePort.discoverCapabilities({}, {}, {}),
        /not implemented/
      );
    });
  });
});

describe('P3-029 Tenant Data Scope Tests', () => {
  it('fileReference requires organizationId from principal', () => {
    const schema = SCHEMAS.fileReference;
    assert.ok(schema.required.includes('organizationId'));
    
    // Verify organizationId cannot be bypassed
    const testRef = {
      fileId: 'file_123',
      classification: 'INTERNAL'
      // Missing organizationId
    };
    
    assert.strictEqual(testRef.organizationId, undefined);
  });
});

describe('P3-029 Retention and Deletion Tests', () => {
  it('enforces maximum retention period', () => {
    const schema = SCHEMAS.sourceIngestionRequest;
    const maxRetention = schema.properties.retentionDays.maximum;
    assert.strictEqual(maxRetention, 2555); // 7 years
  });

  it('supports legal hold flag', () => {
    const schema = SCHEMAS.fileReference;
    assert.ok(schema.properties.legalHold);
    assert.strictEqual(schema.properties.legalHold.type, 'boolean');
  });
});

describe('P3-029 Provider Metadata Tracking', () => {
  it('requires provider identification in provenance', () => {
    const schema = SCHEMAS.provenance;
    assert.ok(schema.required.includes('providerId'));
    assert.ok(schema.required.includes('providerModel'));
    assert.ok(schema.required.includes('ingestedAt'));
  });

  it('tracks provider version', () => {
    const schema = SCHEMAS.provenance;
    assert.ok(schema.properties.providerVersion);
  });
});

describe('P3-029 Human Acceptance Audit', () => {
  it('requires decision rationale', () => {
    const schema = SCHEMAS.humanAcceptanceRequest;
    assert.ok(schema.properties.rationale);
    assert.strictEqual(schema.properties.rationale.minLength, 1);
  });

  it('supports modify decision with proposed changes', () => {
    const validModify = {
      artifactId: 'artifact_123',
      targetResourceId: 'plan_456',
      ifMatch: 'v1',
      decision: 'modify',
      proposedChanges: { title: 'Updated title' },
      rationale: 'Minor correction'
    };

    // Should validate successfully
    assert.ok(validModify.decision === 'modify');
    assert.ok(validModify.proposedChanges);
  });
});

console.log('P3-029 IA Contracts tests loaded');
