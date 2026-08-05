# Evidence classification and audiences

External identity facts are evidence only. Source adapters omit token, assertion, password, authorization-header, and connector-secret material before persistence. Remaining attributes are persisted as classification-tagged evidence references and one-way hashes, not raw values.

Ordinary evaluation and trace responses contain safe references only. The separate evidence endpoint requires `org.orgmodel_evidence.read` through the full backend authorization pipeline and applies the evidence-classification registry server-side. Unauthorized classifications are absent rather than represented by placeholder fields. Audit and shared-outbox payloads contain safe identifiers and reason hashes only.

Publishing permission does not imply evidence-read permission. Mapping evidence never creates a role, permission, membership, Owner Ceiling, Tenant Activation, PBAC activation, or Data Scope assignment.
