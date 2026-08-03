'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  PLANNING_TOOL_MANIFEST_VERSION,
  TOOLS,
  SCHEMAS,
  PROHIBITED_INPUT_PATTERNS,
  validateInput,
  validateProperty,
  createPlanningToolManifest
} = require('../planningTools.contract');

describe('P3-026 Planning MCP Tools Contract', () => {
  describe('Tool Manifest', () => {
    it('creates valid tool manifest with correct version', () => {
      const manifest = createPlanningToolManifest();
      assert.strictEqual(manifest.schemaVersion, PLANNING_TOOL_MANIFEST_VERSION);
      assert.strictEqual(manifest.moduleId, 'planning');
      assert.ok(Array.isArray(manifest.tools));
      assert.strictEqual(manifest.tools.length, 4);
    });

    it('includes all required tools', () => {
      const manifest = createPlanningToolManifest();
      const toolIds = manifest.tools.map(t => t.toolId);
      assert.ok(toolIds.includes('civitas.planning.plans.search'));
      assert.ok(toolIds.includes('civitas.planning.plans.read'));
      assert.ok(toolIds.includes('civitas.planning.roadmaps.read'));
      assert.ok(toolIds.includes('civitas.planning.plans.validate'));
    });

    it('all tools are read-only', () => {
      const manifest = createPlanningToolManifest();
      for (const tool of manifest.tools) {
        assert.strictEqual(tool.readOnly, true, `Tool ${tool.toolId} should be read-only`);
        assert.strictEqual(tool.effect, 'read', `Tool ${tool.toolId} should have read effect`);
        assert.strictEqual(tool.risk, 'R0', `Tool ${tool.toolId} should be R0 risk`);
      }
    });

    it('all tools reference application services', () => {
      const manifest = createPlanningToolManifest();
      for (const tool of manifest.tools) {
        assert.ok(tool.applicationServiceId, `Tool ${tool.toolId} missing applicationServiceId`);
        assert.ok(tool.permissionId, `Tool ${tool.toolId} missing permissionId`);
        assert.ok(tool.policies?.length > 0, `Tool ${tool.toolId} missing policies`);
        assert.strictEqual(tool.dataScope, 'organization', `Tool ${tool.toolId} should have organization dataScope`);
      }
    });

    it('prohibits dangerous capabilities', () => {
      const manifest = createPlanningToolManifest();
      const prohibited = manifest.prohibitedCapabilities;
      assert.ok(prohibited.includes('execute_sql'));
      assert.ok(prohibited.includes('call_provider'));
      assert.ok(prohibited.includes('fetch_url'));
      assert.ok(prohibited.includes('any_operation'));
    });
  });

  describe('Input Schema Validation', () => {
    it('validates plans.search input with valid data', () => {
      const errors = validateInput(SCHEMAS.plansSearchInput, {
        cursor: 'cursor_abc123',
        limit: 50,
        status: 'approved',
        planType: 'strategic',
        titleQuery: 'Test Plan'
      });
      assert.strictEqual(errors.length, 0, JSON.stringify(errors));
    });

    it('rejects additional properties in plans.search', () => {
      const errors = validateInput(SCHEMAS.plansSearchInput, {
        limit: 50,
        maliciousField: 'injected_value'
      });
      assert.ok(errors.some(e => e.code === 'additionalProperty_not_allowed'));
    });

    it('enforces limit bounds in plans.search', () => {
      const errorsOver = validateInput(SCHEMAS.plansSearchInput, { limit: 150 });
      assert.ok(errorsOver.some(e => e.code === 'maximum'));

      const errorsUnder = validateInput(SCHEMAS.plansSearchInput, { limit: 0 });
      assert.ok(errorsUnder.some(e => e.code === 'minimum'));
    });

    it('validates plans.read input with valid planId', () => {
      const errors = validateInput(SCHEMAS.plansReadInput, {
        planId: 'plan_abc123'
      });
      assert.strictEqual(errors.length, 0);
    });

    it('rejects invalid planId pattern', () => {
      const errors = validateInput(SCHEMAS.plansReadInput, {
        planId: 'plan; DROP TABLE--'
      });
      assert.ok(errors.some(e => e.code === 'pattern' || e.code === 'prohibited_pattern_detected'));
    });

    it('requires planId in plans.read', () => {
      const errors = validateInput(SCHEMAS.plansReadInput, {});
      assert.ok(errors.some(e => e.code === 'required'));
    });

    it('validates plans.validate input', () => {
      const errors = validateInput(SCHEMAS.plansValidateInput, {
        planId: 'plan_123',
        validateReferences: true
      });
      assert.strictEqual(errors.length, 0);
    });

    it('rejects SQL injection attempts', () => {
      const sqlInputs = [
        { planId: "plan'; DROP TABLE plans;--" },
        { planId: "plan UNION SELECT * FROM users" },
        { planId: "plan; SELECT password FROM users" }
      ];

      for (const input of sqlInputs) {
        const errors = validateInput(SCHEMAS.plansValidateInput, input);
        assert.ok(
          errors.some(e => e.security === true || e.code === 'prohibited_pattern_detected'),
          `Should reject SQL injection: ${input.planId}`
        );
      }
    });

    it('rejects URL scheme injection', () => {
      const urlInputs = [
        { titleQuery: 'javascript:alert(1)' },
        { titleQuery: 'data:text/html,<script>alert(1)</script>' }
      ];

      for (const input of urlInputs) {
        const errors = validateInput(SCHEMAS.plansSearchInput, input);
        assert.ok(
          errors.some(e => e.security === true),
          `Should reject URL scheme: ${input.titleQuery}`
        );
      }
    });

    it('rejects path traversal', () => {
      const errors = validateInput(SCHEMAS.plansReadInput, {
        planId: '../../../etc/passwd'
      });
      assert.ok(errors.some(e => e.security === true));
    });
  });

  describe('Organization Reconciliation', () => {
    it('tools do not accept organizationId from input', () => {
      // Organization must come from principal.tenantId, never from input
      const schemas = [
        SCHEMAS.plansSearchInput,
        SCHEMAS.plansReadInput,
        SCHEMAS.plansValidateInput,
        SCHEMAS.roadmapsReadInput
      ];

      for (const schema of schemas) {
        // Verify organizationId is not in properties
        assert.strictEqual(
          schema.properties?.organizationId,
          undefined,
          'Schema should not accept organizationId from input'
        );
      }
    });
  });

  describe('Output Limits', () => {
    it('all tools define output size limits', () => {
      const manifest = createPlanningToolManifest();
      for (const tool of manifest.tools) {
        assert.ok(tool.outputLimits?.maxSizeBytes, `Tool ${tool.toolId} missing outputLimits`);
        assert.ok(tool.outputLimits.maxSizeBytes <= 65536, `Tool ${tool.toolId} exceeds max output size`);
      }
    });

    it('paginated tools define pagination limits', () => {
      const manifest = createPlanningToolManifest();
      const paginatedTools = manifest.tools.filter(t => t.pagination !== null);
      
      for (const tool of paginatedTools) {
        assert.ok(tool.pagination?.maxLimit, `Tool ${tool.toolId} missing maxLimit`);
        assert.strictEqual(tool.pagination.maxLimit, 100, `Tool ${tool.toolId} should have maxLimit 100`);
      }
    });
  });

  describe('Parity with REST', () => {
    it('tools use same permissions as REST endpoints', () => {
      const manifest = createPlanningToolManifest();
      
      // All planning read tools should use planning.plans.read or equivalent
      for (const tool of manifest.tools) {
        assert.ok(
          tool.permissionId.includes('.read') || tool.permissionId.includes('plans.read'),
          `Tool ${tool.toolId} should use read permission, got ${tool.permissionId}`
        );
      }
    });

    it('tools apply same policies as REST', () => {
      const manifest = createPlanningToolManifest();
      
      for (const tool of manifest.tools) {
        assert.ok(tool.policies.includes('same-organization'));
        assert.ok(tool.policies.includes('membership-required'));
      }
    });
  });
});

describe('P3-026 Cross-Tenant Isolation Tests', () => {
  it('principal tenantId is used for org reconciliation, not input', () => {
    // Simulate principal with tenantId
    const principal = {
      type: 'user',
      subjectId: 'user_123',
      authenticatedClientId: 'client_456',
      tenantId: 'org_abc'
    };

    // Tool execution should use principal.tenantId for scoping
    // This test verifies the contract doesn't allow org override
    const manifest = createPlanningToolManifest();
    
    for (const tool of manifest.tools) {
      // Verify tool input schema has no organizationId field
      assert.strictEqual(
        tool.inputSchema.properties?.organizationId,
        undefined,
        `Tool ${tool.toolId} should not accept organizationId`
      );
    }
  });
});

describe('P3-026 Module Availability Integration', () => {
  it('tools reference valid module and capability IDs', () => {
    const manifest = createPlanningToolManifest();
    
    for (const tool of manifest.tools) {
      assert.strictEqual(tool.moduleId, 'planning');
      assert.ok(tool.capabilityId.startsWith('planning.'));
      assert.ok(tool.operationId.startsWith('planning.'));
    }
  });
});

describe('P3-026 Audit Correlation', () => {
  it('tool definitions support audit correlation', () => {
    const manifest = createPlanningToolManifest();
    
    // Each tool should produce auditable events
    for (const tool of manifest.tools) {
      assert.ok(tool.toolId, 'Tool must have ID for audit');
      assert.ok(tool.version, 'Tool must have version for audit');
      assert.ok(tool.applicationServiceId, 'Tool must reference service for audit trail');
    }
  });
});

describe('P3-026 Rate Limiting Support', () => {
  it('manifest defines runtime controls for rate limiting', () => {
    const manifest = createPlanningToolManifest();
    
    assert.ok(manifest.runtimeControls?.timeoutMs);
    assert.ok(manifest.runtimeControls?.maxConcurrentPerTenant);
    assert.ok(manifest.runtimeControls?.maxOutputSizeBytes);
    
    // Verify reasonable limits
    assert.ok(manifest.runtimeControls.timeoutMs <= 10000);
    assert.ok(manifest.runtimeControls.maxConcurrentPerTenant >= 10);
  });
});

describe('P3-026 Validate Tool Read-Only Guarantee', () => {
  it('plans.validate is strictly read-only', () => {
    const manifest = createPlanningToolManifest();
    const validateTool = manifest.tools.find(t => t.toolId === 'civitas.planning.plans.validate');
    
    assert.ok(validateTool, 'validate tool should exist');
    assert.strictEqual(validateTool.readOnly, true);
    assert.strictEqual(validateTool.effect, 'read');
    assert.strictEqual(validateTool.risk, 'R0');
    assert.strictEqual(validateTool.makerChecker, false);
    
    // Should not have write-related fields
    assert.strictEqual(validateTool.idempotency, 'forbidden');
    assert.strictEqual(validateTool.ifMatch, 'none');
  });
});

console.log('P3-026 Planning MCP Tools Contract tests loaded');
