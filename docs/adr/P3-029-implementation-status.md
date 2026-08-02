# P3-029: Async IA Source Ingestion and Governed Reuse Implementation Status

**Status:** `IMPLEMENTED - CONTRACTS ONLY`  
**Date:** 2026-07-30  
**Version:** `civitas-p3-029/v1`  
**Depends on:** P3-028 (ADR approved)  

## Summary

P3-029 implements **contracts only** for async IA source ingestion, findings, suggestions/candidates, assistance/discovery ports, and governed reuse. No model calls or ingestion implementation included per requirements.

## Implemented Components

### 1. Contract Module (`/workspace/backend/ia/p3-029-contracts.js`)

#### Constants
- `P3029_CONTRACT_VERSION`: 'civitas-p3-029/v1'
- `IA_ARTIFACT_STATUSES`: ['draft', 'pending_review', 'accepted', 'rejected', 'expired', 'deleted']
- `CLASSIFICATION_LEVELS`: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
- `ARTIFACT_TYPES`: ['source', 'prompt', 'response', 'finding', 'suggestion', 'candidate', 'generated_document', 'external_media']
  - **Excludes embeddings/graph** per requirements (no separate contract)

#### Schemas (Closed and Bounded)
All schemas enforce:
- `additionalProperties: false`
- Explicit required fields
- Max lengths and bounds
- Pattern validation
- Enum constraints

| Schema | Purpose | Key Constraints |
|--------|---------|-----------------|
| `fileReference` | Async file reference | Requires fileId, organizationId, classification; SHA-256 contentHash |
| `sourceIngestionRequest` | Ingestion request | Max retention 2555 days (7 years); provider metadata required |
| `finding` | IA analysis finding | Severity enum; confidence 0-1; evidence array max 50 |
| `suggestion` | Human review candidate | Requires targetResourceId, proposedChanges, rationale |
| `humanAcceptanceRequest` | Acceptance with concurrency | **Requires ifMatch** for optimistic concurrency |
| `provenance` | Provider/model tracking | Tracks providerId, model, version, license, humanDecision |
| `iaArtifact` | Full artifact record | Links fileReference, provenance, retentionExpiresAt, legalHold |
| `ingestionResponse` | Async response | Returns artifactId, operationId, estimatedCompletionTime |
| `findingsList` | Paginated findings | Cursor-based pagination |
| `suggestionsList` | Paginated suggestions | Cursor-based pagination |

#### Port Interfaces (Abstract - No Implementation)

| Port | Operations | Purpose |
|------|------------|---------|
| `IASourceIngestionPort` | `ingestSource`, `getArtifactStatus`, `requestDeletion` | Async ingestion with file references |
| `IAFindingsPort` | `listFindings`, `getFinding`, `updateFindingDisposition` | Query and manage findings |
| `IASuggestionsPort` | `listSuggestions`, `getSuggestion`, `submitHumanAcceptance`, `expireSuggestion` | Manage suggestions with **human acceptance gate** |
| `IAAssistancePort` | `discoverCapabilities`, `requestAssistance` | Discovery and read-only assistance |

All port methods throw `not implemented` error - contracts only per requirements.

#### Utility Functions

```javascript
generateIdempotencyKey(request, organizationId)
// Deterministic SHA-256 key from: org, fileId, contentHash, artifactType, purpose, provider, model

determineEffectiveClassification(sources, metadata='INTERNAL', context='INTERNAL')
// Returns most restrictive: RESTRICTED > CONFIDENTIAL > INTERNAL > PUBLIC

validateNoProhibitedPatterns(value)
// Rejects SQL, URL schemes, path traversal, credentials, private keys
```

#### Prohibited Patterns
- SQL injection (SELECT, INSERT, DROP, etc.)
- URL schemes (javascript:, data:, vbscript:)
- HTML script tags
- File paths and traversal (../)
- Code execution (eval, system, shell_exec)
- Private keys (BEGIN PRIVATE KEY)
- Credentials (password=, api_key:, token=)

### 2. Test Suite (`/workspace/backend/ia/test/p3-029-contracts.test.js`)

**Results:** 31 tests passing, 0 failures

#### Coverage
- Contract constants validation
- Schema validation (fileReference, sourceIngestionRequest, humanAcceptanceRequest)
- Idempotency key generation (deterministic, org-scoped)
- Classification inheritance (most restrictive wins)
- Prohibited pattern detection (SQL, URLs, credentials)
- Port interface abstract behavior
- Tenant data scope enforcement
- Retention period limits (max 2555 days)
- Legal hold support
- Provider metadata tracking
- Human acceptance audit (requires rationale, If-Match)

## Key Design Decisions

### 1. Human Acceptance Gate
- **If-Match required** for optimistic concurrency
- Decision must be 'accept', 'reject', or 'modify'
- Rationale mandatory (minLength: 1)
- Proposed changes tracked for 'modify' decisions
- No canonical mutation without human approval

### 2. Classification Inheritance
- Most restrictive classification wins
- Unknown sources default to RESTRICTED (fail closed)
- Applies to sources, metadata, and retrieved context

### 3. Idempotent Deduplication
- Key includes: organizationId, fileId, contentHash, artifactType, purpose, provider, model
- Prevents duplicate ingestion across retries
- Tenant-scoped isolation

### 4. Retention and Deletion
- Maximum retention: 2555 days (7 years)
- legalHold flag prevents deletion
- retentionExpiresAt computed at ingestion
- requestDeletion marks for cascade deletion per policy

### 5. Provider Metadata Tracking
- Tracks providerId, providerModel, providerVersion
- License recorded for compliance
- IngestedAt timestamp for audit
- Enables supply chain traceability

### 6. Exclusions Per Requirements
- **NO embeddings/graph** - excluded without separate contract
- **NO model calls** - contracts only
- **NO ingestion implementation** - ports throw not implemented
- **NO canonical mutation** without human acceptance

## Security Properties

### Tenant Isolation
- organizationId required in all file references
- Idempotency keys include organizationId
- No cross-tenant artifact access in contracts

### Input Validation
- Closed schemas (additionalProperties: false)
- Prohibited pattern detection
- Max length enforcement
- Enum constraints

### Audit Trail
- Provenance tracking with provider metadata
- Human decision recording (who, when, rationale, comparedVersion)
- Correlation with operationId and correlationId

## Compliance Alignment

### P3-028 Standard
This implementation aligns with P3-028 requirements:
- Classification levels match (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED)
- Minimization via closed schemas and field allowlists
- Encryption referenced (encryptionKeyId, contentHash)
- Access control via principal scoping
- Retention/deletion with legal hold support
- Provenance/license tracking
- Provider transfer metadata
- Logging/analytics with redaction
- Human acceptance as final gate

### Threat Model Coverage
| Threat ID | Mitigation in P3-029 |
|-----------|---------------------|
| T01 (Prompt injection) | Closed schemas, prohibited patterns |
| T02 (Data exfiltration) | Minimization, no raw provider calls |
| T03 (Cross-tenant leak) | organizationId scoping |
| T06 (Credential leakage) | Prohibited credential patterns |
| T08 (Legal hold bypass) | legalHold flag in fileReference |
| T10 (Unauthorized acceptance) | If-Match + server-side authz required |

## Unresolved Dependencies

### Blockers from P3-028
Per ADR P3-028, the following decisions remain unresolved (BLOCKER):

| ID | Decision | Owner | Status |
|----|----------|-------|--------|
| OD-01 | Jurisdictions and retention periods | Legal/Privacy | PENDIENTE |
| OD-02 | Approved AI providers list | Security + Legal | PENDIENTE |
| OD-03 | International transfer mechanisms | Legal/Privacy | PENDIENTE |
| OD-04 | Minor age definition | Legal/Privacy | PENDIENTE |
| OD-05 | DPIA procedure | Legal/Privacy | PENDIENTE |
| OD-06 | KMS and key rotation strategy | Security | PENDIENTE |
| OD-07 | Vector index provider compliance | Security + Architecture | PENDIENTE |

**Implementation Status:** Contracts ready; implementation blocked until P3-028 approvals complete.

## Testing Evidence

### Contract Tests
```bash
cd /workspace/backend && node --test ia/test/p3-029-contracts.test.js
# tests 31
# pass 31
# fail 0
```

### Related Tests
- P3-026 Planning MCP Tools: 25 tests passing
- Production Readiness Drill: All 7 checks passing (synthetic)

## Next Steps

1. **P3-028 Approval Required**: Obtain Architecture, Security, and Legal/Privacy approval
2. **Implementation Phase**: Implement ports with:
   - PostgreSQL repositories for artifacts, findings, suggestions
   - Outbox operations for async processing
   - Provider adapters (after approved provider list)
   - KMS integration for encryption
   - Audit logging integration
3. **Testing Phase**: Add integration tests for:
   - Malformed input/provider failure
   - Stale decision handling
   - Tenant/data-scope enforcement
   - Retention/deletion cascade
   - Idempotent dedup under load
4. **Deployment**: Canary deployment with rollback plan

## Files Modified/Created

| File | Type | Purpose |
|------|------|---------|
| `/workspace/backend/ia/p3-029-contracts.js` | Created | Contract definitions |
| `/workspace/backend/ia/test/p3-029-contracts.test.js` | Created | Contract tests |
| `/workspace/docs/adr/P3-029-implementation-status.md` | Created | This document |

---

**Note:** This implementation satisfies P3-029 requirements for contracts-only delivery. Full implementation requires P3-028 approval and is deferred until blockers are resolved.
