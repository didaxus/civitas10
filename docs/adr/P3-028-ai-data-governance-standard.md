# P3-028: Standard de Gobierno de Datos para Artefactos de IA

## Estado

**Propuesto** — Requiere aprobación de Arquitectura, Seguridad y Legal/Privacy antes de implementación.

## Fecha

2026-07-30

## Versión del documento

`P3-028 v1.0.0`

## Relacionado

- ADR-005: Gobierno de datos para artefactos de IA
- ADR-001: MCP Boundary in Civitas
- ADR-006: MCP Transport/Runtime Boundary and Trust Architecture
- #197, #198, #188

## Propósito

Este standard define los requisitos obligatorios para el tratamiento de todos los artefactos generados, procesados o consumidos por sistemas de IA dentro de Civitas, incluyendo:

- Fuentes de datos (sources)
- Prompts y plantillas
- Respuestas de proveedores de IA
- Hallazgos (findings)
- Sugerencias y candidatos (suggestions/candidates)
- Embeddings y representaciones vectoriales
- Medios externos referenciados
- Documentos generados

## 1. Clasificación de Datos

### 1.1 Niveles de Clasificación

Todo artefacto de IA debe ser clasificado en uno de los siguientes niveles:

| Nivel | Descripción | Ejemplos | Tratamiento IA |
|-------|-------------|----------|----------------|
| `PUBLIC` | Información aprobada para publicación general | Contenido educativo público, documentación | Permitido con proveedor aprobado |
| `INTERNAL` | Operación interna sin datos personales | Métricas operativas agregadas, configuraciones | Permitido para finalidad declarada; no entrenamiento |
| `CONFIDENTIAL` | Datos personales ordinarios, contenido no público | Datos de estudiantes, planes institucionales | Minimizar y redactar; cifrado obligatorio; proveedor expresamente aprobado |
| `RESTRICTED` | Categorías especiales, secretos, datos de alto riesgo | Datos médicos, financieros, menores, material bajo legal hold | Denegado por defecto; requiere excepción documentada de Seguridad y Legal/Privacy |

### 1.2 Reglas de Herencia de Clasificación

La clasificación efectiva de un artefacto derivado es **la más restrictiva** entre:

1. Todas las fuentes de entrada
2. Los metadatos asociados
3. El contexto de recuperación (RAG)
4. La plantilla de prompt utilizada
5. Cualquier dato personal identificable presente

```typescript
// Ejemplo: Función de determinación de clasificación
function determineEffectiveClassification(artifact: IAArtifact): Classification {
  const sources = artifact.sources.map(s => s.classification);
  const metadata = artifact.metadata?.classification || 'INTERNAL';
  const context = artifact.retrievedContext?.classification || 'INTERNAL';
  
  const allClassifications = [...sources, metadata, context];
  
  // Orden de restrictividad: RESTRICTED > CONFIDENTIAL > INTERNAL > PUBLIC
  if (allClassifications.includes('RESTRICTED')) return 'RESTRICTED';
  if (allClassifications.includes('CONFIDENTIAL')) return 'CONFIDENTIAL';
  if (allClassifications.includes('INTERNAL')) return 'INTERNAL';
  return 'PUBLIC';
}
```

### 1.3 Clasificación Desconocida

Si no se puede determinar la clasificación de una fuente, el artefacto resultante se clasifica automáticamente como `RESTRICTED` y se falla cerrado (no se procesa).

## 2. Minimización de Datos

### 2.1 Principio de Mínimo Privilegio para Datos

Antes de invocar cualquier sistema de IA:

1. **Allowlist de campos**: Solo se incluyen campos explícitamente autorizados para la finalidad específica
2. **Redacción automática**: Identificadores directos (nombres, emails, IDs) se pseudonimizan o redactan
3. **Truncamiento contextual**: El contexto se limita al mínimo necesario para la tarea
4. **Validación pre-envío**: Se verifica que no haya credenciales, secretos o datos `RESTRICTED` no autorizados

### 2.2 Campos Prohibidos por Defecto

Nunca se envían a proveedores de IA sin autorización expresa:

- Credenciales (passwords, tokens, API keys, certificados)
- Secretos de aplicación o infraestructura
- Datos biométricos o de categorías especiales GDPR
- Información financiera completa (números de tarjeta, cuentas bancarias)
- Datos de menores de edad sin consentimiento verificable
- Material sujeto a legal hold sin autorización de Legal/Privacy
- Logs completos de auditoría con datos personales

### 2.3 Técnicas de Minimización

```typescript
interface MinimizationResult {
  originalSize: number;
  minimizedSize: number;
  redactedFields: string[];
  pseudonymizedIds: Map<string, string>;
  classification: Classification;
}

function minimizeForAI(input: unknown, purpose: string): MinimizationResult {
  // Implementación debe incluir:
  // 1. Filtrado por allowlist de campos
  // 2. Redacción de patrones sensibles (emails, phones, IDs)
  // 3. Pseudonimización reversible solo si necesario
  // 4. Truncamiento de texto a límites seguros
  // 5. Validación de ausencia de secretos
}
```

## 3. Cifrado

### 3.1 Cifrado en Tránsito

- **TLS 1.3** obligatorio para todas las comunicaciones con proveedores de IA
- **Certificate pinning** recomendado para proveedores críticos
- **Mutual TLS (mTLS)** para integraciones privadas o VPC-peered

### 3.2 Cifrado en Reposo

Todos los artefactos de IA persistentes deben estar cifrados:

| Almacén | Requisito de Cifrado | Gestión de Claves |
|---------|---------------------|-------------------|
| PostgreSQL (contenido) | AES-256 | AWS KMS / Azure Key Vault / HashiCorp Vault |
| Redis (caché) | AES-256 | Claves rotadas cada 90 días |
| S3/Blob Storage | AES-256 + SSE-S3 o SSE-KMS | Claves por entorno |
| Índices vectoriales | AES-256 | Mismo proveedor que datos fuente |
| Backups | AES-256 + cifrado adicional | Claves separadas de producción |

### 3.3 Rotación de Claves

- **Frecuencia mínima**: Cada 12 meses para claves de datos, 90 días para cachés
- **Procedimiento documentado**: Runbook de rotación con rollback
- **Pruebas de recuperación**: Verificación trimestral de backup/restore

## 4. Control de Acceso

### 4.1 Aislamiento de Tenant

- Todos los artefactos de IA están scoped por `organizationId`
- Consultas cruzadas entre tenants están estructuralmente prohibidas
- Índices vectoriales segregados por tenant o cifrados con claves por tenant

### 4.2 Autorización Server-Side

El acceso a artefactos de IA requiere:

1. **Autenticación válida** con principal verificado
2. **Autorización PBAC** con políticas de data scope
3. **Verificación de propósito** cuando corresponda
4. **Auditoría correlacionada** con decisionId

```typescript
async function accessIAArtifact(
  artifactId: string,
  principal: Principal,
  purpose?: string
): Promise<IAArtifact | AccessDeniedError> {
  // 1. Verificar autenticación
  if (!principal.isAuthenticated()) throw new AuthenticationError();
  
  // 2. Verificar autorización con data scope
  const authzDecision = await authorizationPort.authorize({
    principal,
    permissionId: 'ia.artifacts.read',
    resourceId: artifactId,
    purpose
  });
  
  if (!authzDecision.allowed) throw new AccessDeniedError();
  
  // 3. Verificar propósito si requerido
  if (purpose && !await validatePurpose(principal, artifactId, purpose)) {
    throw new PurposeMismatchError();
  }
  
  // 4. Registrar auditoría
  await auditPort.record({
    eventType: 'ia.artifact.accessed.v1',
    principalId: principal.subjectId,
    artifactId,
    decisionId: authzDecision.decisionId,
    purpose
  });
  
  return await repository.getById(artifactId);
}
```

### 4.3 Acceso Break-Glass

Para situaciones de emergencia:

- Requiere aprobación de Security owner o delegate autorizado
- Tiempo limitado (máximo 24 horas)
- Auditoría reforzada con justificación obligatoria
- Revisión post-incidente dentro de 72 horas

## 5. Retención y Eliminación

### 5.1 Plazos de Retención por Tipo de Artefacto

| Tipo de Artefacto | Clasificación Mínima | Retención Máxima | Borrado Automático |
|-------------------|---------------------|------------------|-------------------|
| Prompt plantilla (sin datos tenant) | INTERNAL | Vida de versión + 2 años | Sí |
| Entrada de usuario y contexto | Heredada de fuente | 30 días (preferir 0) | Sí |
| Prompt renderizado | Máxima de componentes | 0 días (hasta 30 para debugging) | Sí |
| Respuesta cruda del modelo | Heredada de entradas | 30 días | Sí |
| Borrador editado por humano | Heredada + edición | 90 días desde última edición | Sí |
| Revisión canónica aceptada | Según registro destino | Política del registro canónico | Según política destino |
| Feedback/rating/corrección | CONFIDENTIAL si atribuible | 180 días, luego anonimizar | Parcial |
| Embedding/índice vectorial | Heredada de fuentes | No más que fuentes; caché ≤ 24h | En cascada |
| Log operativo redactado | INTERNAL | 30 días online + 335 archivo | Sí |
| Evento de auditoría | CONFIDENTIAL | 7 años (sujeto a jurisdicción) | No (append-only) |
| Copia temporal proveedor | Misma que artefacto | 0 días (máx 30 contractual) | vía API/SLA |
| Evidencia de consentimiento | CONFIDENTIAL | Duración tratamiento + plazo defensa | Minimizado |

### 5.2 Cascada de Eliminación

Cuando un artefacto fuente se elimina, todos sus derivados deben eliminarse:

```typescript
async function cascadeDeletion(artifactId: string, reason: string): Promise<void> {
  const artifact = await repository.getById(artifactId);
  if (!artifact) return;
  
  // 1. Marcar como deletion_pending
  await repository.updateStatus(artifactId, 'deletion_pending');
  
  // 2. Verificar legal holds
  const holds = await legalHoldService.getActiveHolds({ artifactId });
  if (holds.length > 0) {
    // Hold prevalece - segregar contenido
    await segregateUnderHold(artifactId, holds);
    return;
  }
  
  // 3. Eliminar derivados
  const derivatives = await repository.getDerivatives(artifactId);
  for (const derivative of derivatives) {
    await cascadeDeletion(derivative.id, `parent_${artifactId}_deleted`);
  }
  
  // 4. Eliminar de todos los almacenes
  await Promise.all([
    repository.delete(artifactId),
    vectorIndex.remove(artifactId),
    cache.invalidate(artifactId),
    provider.requestDeletion(artifactId.providerCopyId)
  ]);
  
  // 5. Registrar evidencia mínima permitida
  await auditPort.record({
    eventType: 'ia.artifact.deleted.v1',
    artifactId,
    reason,
    derivativesDeleted: derivatives.map(d => d.id),
    timestamp: new Date().toISOString()
  });
}
```

### 5.3 Backups y Restauración

- Los objetos expirados en backups se marcan para supresión en restore
- La restauración no reinicia plazos de retención
- Rotación documentada de backups elimina objetos expirados

## 6. Legal Hold

### 6.1 Definición y Alcance

Un legal hold es una orden de preservación emitida por Records/Legal que suspende temporalmente la eliminación de artefactos específicos para cumplir con obligaciones legales, litigios o investigaciones.

### 6.2 Jerarquía de Decisiones

**Legal hold prevalece sobre solicitudes de borrado**, pero solo para:

- El contenido específicamente identificado en el hold
- El período de tiempo cubierto por el hold
- Los derivados directamente relacionados

### 6.3 Flujo de Hold/Release

```typescript
async function applyLegalHold(hold: LegalHold): Promise<void> {
  // 1. Identificar artefactos en alcance
  const artifacts = await repository.findByScope(hold.scope);
  
  // 2. Segregar en almacenamiento especial
  for (const artifact of artifacts) {
    await segregatedStorage.move(artifact.id, hold.id);
    await repository.updateStatus(artifact.id, 'under_legal_hold');
  }
  
  // 3. Suspender procesos automáticos de borrado
  await retentionService.suspend(artifacts.map(a => a.id));
  
  // 4. Registrar aplicación del hold
  await auditPort.record({
    eventType: 'legal.hold.applied.v1',
    holdId: hold.id,
    artifactsAffected: artifacts.map(a => a.id),
    issuedBy: hold.issuedBy,
    authority: hold.authority
  });
}

async function releaseLegalHold(holdId: string): Promise<void> {
  const hold = await legalHoldRepository.getById(holdId);
  if (!hold) throw new NotFoundError();
  
  // 1. Solo Legal/Privacy puede liberar
  if (!await legalOwner.verifyAuthority(hold.issuedBy)) {
    throw new UnauthorizedError();
  }
  
  // 2. Identificar artefactos bajo hold
  const artifacts = await segregatedStorage.getByHold(holdId);
  
  // 3. Reanudar solicitudes de borrado pendientes
  for (const artifact of artifacts) {
    if (artifact.deletionPending) {
      await cascadeDeletion(artifact.id, 'hold_released');
    } else {
      await repository.updateStatus(artifact.id, 'active');
    }
  }
  
  // 4. Liberar de almacenamiento segregado
  await segregatedStorage.release(holdId);
  
  // 5. Auditar liberación
  await auditPort.record({
    eventType: 'legal.hold.released.v1',
    holdId,
    releasedBy: hold.issuedBy,
    timestamp: new Date().toISOString()
  });
}
```

### 6.4 Prohibiciones

- **NO** usar holds globales por conveniencia
- **NO** ampliar automáticamente el alcance de un hold
- **NO** conservar copias operativas "por si acaso"
- **NO** revelar materia privilegiada al solicitante del borrado

## 7. Provenance y Licencia

### 7.1 Metadatos de Procedencia Obligatorios

Cada artefacto de IA debe registrar:

```typescript
interface ProvenanceMetadata {
  // Identificación básica
  artifactId: string;
  organizationId: string;
  type: ArtifactType;
  classification: Classification;
  
  // Fuentes
  sources: Array<{
    id: string;
    type: string;
    version?: string;
    hash?: string; // Para integridad
    classification: Classification;
    license?: string;
  }>;
  
  // Actores y contexto
  initiatedBy: {
    principalId: string;
    principalType: 'user' | 'agent' | 'system';
    authenticatedClientId: string;
  };
  correlationId: string;
  traceId: string;
  
  // Procesamiento IA
  promptTemplate?: {
    id: string;
    version: string;
    transformationsApplied: string[];
  };
  provider: {
    name: string;
    region: string;
    model: string;
    modelVersion: string;
    configurationHash?: string;
  };
  
  // Temporalidad
  createdAt: string; // ISO-8601
  expiresAt?: string; // ISO-8601
  
  // Derivación
  derivedFrom?: string[]; // artifactIds
  isDerivativeOf?: string; // artifactId padre
  
  // Estado y decisión humana
  status: 'draft' | 'accepted' | 'rejected' | 'expired' | 'deletion_pending' | 'held';
  humanDecision?: {
    decision: 'accept' | 'reject';
    decidedBy: string; // principalId
    decidedAt: string;
    comparedVersion: string;
    rationale?: string;
  };
  
  // Retención y hold
  retentionPolicy: {
    policyId: string;
    maxRetentionDays: number;
    basis: string;
  };
  legalHoldIds?: string[];
  deletionEvidence?: {
    deletedAt: string;
    method: string;
    verifiedBy: string;
  };
}
```

### 7.2 Licencias y Límites de Reutilización

- Las fuentes externas deben declarar licencia explícita
- Los límites de reutilización (ej: solo inferencia, no entrenamiento) se registran y hacen cumplir
- El incumplimiento de términos de licencia bloquea el procesamiento

## 8. Transferencia a Proveedores

### 8.1 Requisitos Previos a la Transferencia

Antes de transferir cualquier dato a un proveedor de IA:

1. **Inventario y evaluación del proveedor** completados
2. **DPA (Data Processing Agreement)** firmado y vigente
3. **Región geográfica** aprobada para el tipo de datos
4. **Mecanismo de transferencia** válido (SCCs, BCRs, etc.)
5. **Lista de subprocesadores** notificada y aprobada
6. **Controles técnicos** verificados (cifrado, aislamiento, acceso)
7. **SLA de incidente y borrado** contractualmente vinculante
8. **Derecho de auditoría** explícito en contrato

### 8.2 Configuración de No-Entrenamiento

La configuración contractual y técnica debe impedir explícitamente:

- Entrenamiento de modelos con datos de Civitas
- Fine-tuning usando datos de tenant
- Retención más allá del necesario para la inferencia
- Uso secundario (mejora de servicio, analytics, etc.)

Cualquier cambio en estos términos invalida la aprobación hasta re-evaluación.

### 8.3 Minimización en Transferencia

```typescript
interface TransferPayload {
  // Solo campos mínimos necesarios
  minimizedInput: unknown;
  
  // IDs pseudonimizados
  pseudonymizedIds: Record<string, string>;
  
  // Metadatos de control
  purpose: string;
  classification: Classification;
  retentionInstruction: 'delete_after_inference' | 'max_30_days';
  
  // Prohibido enviar
  // - secrets, credentials, tokens
  // - raw PII sin redacción
  // - datos RESTRICTED sin excepción
}
```

### 8.4 Verificación de Borrado en Proveedor

Los proveedores deben proporcionar:

- **API de borrado** verificable o
- **Certificado de borrado** emitido dentro de SLA o
- **Configuración de 0 días** documentada

Sin mecanismo de verificación, el proveedor no está aprobado para datos `CONFIDENTIAL` o superiores.

## 9. Logging y Analytics

### 9.1 Allowlist de Campos para Logs

Solo los siguientes campos pueden registrarse en logs operativos:

```typescript
interface AllowedLogFields {
  // Identificadores opacos
  artifactId?: string;
  correlationId: string;
  traceId: string;
  spanId?: string;
  
  // Contexto de operación
  operationId: string;
  tenantId: string; // organizationId
  classification: Classification;
  
  // Proveedor y modelo (no contenido)
  providerName?: string;
  modelName?: string;
  modelVersion?: string;
  
  // Métricas de rendimiento
  latencyMs: number;
  tokenCount?: { input: number; output: number };
  costUsd?: number;
  
  // Resultado de controles
  authorizationDecisionId: string;
  dataScopeValid: boolean;
  minimizationApplied: boolean;
  
  // Decisión humana (si aplica)
  humanDecision?: 'accept' | 'reject';
  reviewerId?: string; // solo ID, no nombre
  
  // Eventos de ciclo de vida
  lifecycleEvent?: 'created' | 'accessed' | 'deleted' | 'held';
}
```

### 9.2 Campos Prohibidos en Logs

Nunca registrar:

- Contenido completo de prompts o respuestas
- Authorization headers, cookies, tokens
- Secretos o credenciales
- Datos personales sin redacción
- Embeddings o representaciones vectoriales crudas
- Payloads completos de requests/responses

### 9.3 Redacción Antes de Emitir

```typescript
function redactBeforeLog(logEntry: unknown): RedactedLogEntry {
  const sensitivePatterns = [
    /authorization:\s*.*/i,
    /cookie:\s*.*/i,
    /token[=:]\s*.*/i,
    /secret[=:]\s*.*/i,
    /password[=:]\s*.*/i,
    /email[=:]\s*["']?[^"'\s]+/i,
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
    /\b\d{16}\b/, // Credit card pattern
  ];
  
  // Implementar redacción estructurada, no solo regex
  // Verificar contra allowlist de campos
  // Validar clasificación residual
}
```

### 9.4 Auditoría Append-Only

Los siguientes eventos requieren auditoría inmutable:

- Creación de artefactos con clasificación `CONFIDENTIAL` o superior
- Acceso a artefactos bajo legal hold
- Decisiones humanas de aceptación/rechazo
- Solicitudes y ejecuciones de borrado
- Aplicación y liberación de legal holds
- Cambios en políticas de retención
- Exportaciones o transferencias a proveedores
- Incidentes de seguridad o accesos no autorizados

## 10. Aceptación Humana

### 10.1 Principio de No Mutación Canónica

**Ninguna respuesta de IA, acción de agente, resumen, clasificación o extracción mutará automáticamente una versión canónica o aprobada.**

La salida de IA se guarda, como máximo, como `draft` no canónico. La promoción a estado canónico requiere:

1. **Acción humana autenticada e intencional**
2. **Comparación visible** entre estado actual y propuesta
3. **Autorización ordinaria de Civitas** (permisos, data scope)
4. **Validaciones de dominio** específicas del caso de uso
5. **Evento de auditoría** con identidad del revisor

### 10.2 Flujo de Aceptación

```typescript
interface HumanAcceptanceRequest {
  artifactId: string; // IA draft
  targetResourceId: string; // Canonical resource to update
  proposedChanges: unknown; // Diff o cambios propuestos
  reviewerDecision: 'accept' | 'reject' | 'abstain';
  rationale?: string;
  ifMatch: string; // Optimistic concurrency
}

async function submitHumanAcceptance(
  request: HumanAcceptanceRequest,
  principal: Principal,
  context: OperationContext
): Promise<Result<CanonicalUpdate, AcceptanceError>> {
  // 1. Verificar autenticación y autorización del revisor
  const authz = await authorizationPort.authorize({
    principal,
    permissionId: 'planning.plans.update',
    actionId: 'planning.plans.accept_suggestion',
    resourceId: request.targetResourceId
  });
  
  if (!authz.allowed) {
    return Result.fail(new AcceptanceError('UNAUTHORIZED_REVIEWER'));
  }
  
  // 2. Verificar concurrencia optimista
  const currentResource = await canonicalRepository.getById(request.targetResourceId);
  if (!currentResource) {
    return Result.fail(new AcceptanceError('TARGET_NOT_FOUND'));
  }
  
  if (String(currentResource.version) !== String(request.ifMatch)) {
    return Result.fail(new AcceptanceError('CONCURRENT_MODIFICATION', {
      expectedVersion: request.ifMatch,
      currentVersion: currentResource.version
    }));
  }
  
  // 3. Validar que el artifact es un draft de IA pendiente
  const artifact = await iaRepository.getById(request.artifactId);
  if (!artifact || artifact.status !== 'draft' || !artifact.aiGenerated) {
    return Result.fail(new AcceptanceError('INVALID_ARTIFACT_STATE'));
  }
  
  // 4. Ejecutar comando de actualización canónica
  const updatedResource = await canonicalRepository.update({
    id: request.targetResourceId,
    ...request.proposedChanges,
    updatedBy: principal.subjectId,
    updatedAt: new Date().toISOString(),
    provenance: {
      sourceArtifactId: request.artifactId,
      acceptedBy: principal.subjectId,
      acceptedAt: new Date().toISOString(),
      rationale: request.rationale
    }
  });
  
  // 5. Actualizar estado del artifact IA
  await iaRepository.updateStatus(request.artifactId, 'accepted', {
    humanDecision: {
      decision: 'accept',
      decidedBy: principal.subjectId,
      decidedAt: new Date().toISOString(),
      comparedVersion: request.ifMatch,
      rationale: request.rationale
    }
  });
  
  // 6. Auditar aceptación
  await auditPort.record({
    eventType: 'ia.human.acceptance.v1',
    artifactId: request.artifactId,
    targetResourceId: request.targetResourceId,
    reviewerId: principal.subjectId,
    decisionId: authz.decisionId,
    correlationId: context.correlationId
  });
  
  return Result.ok(updatedResource);
}
```

### 10.3 Interfaz de Usuario Requerida

La UI debe:

1. **Separar visualmente**:
   - Fuente canónica actual
   - Salida IA no confiable (marcada claramente)
   - Versión propuesta/editada
   
2. **Señalar incertidumbre**:
   - Campos modificados resaltados
   - Nivel de confianza si disponible
   - Fuentes/procedencia accesibles
   
3. **Requerir confirmación explícita**:
   - Sin selección masiva por defecto
   - Doble control para acciones de alto impacto
   - Rationale opcional pero recomendado

### 10.4 Lo Que No Cuenta Como Aceptación

- Timeouts o retries automáticos
- Webhooks o callbacks de proveedores
- Tool-calls interpretados como aprobación
- Acciones de agentes automatizados sin revisión humana
- Silencio o inacción del usuario
- Casillas premarcadas o términos generales

## 11. Threat Model

### 11.1 Amenazas Consideradas

| ID | Amenaza | Categoría | Mitigación |
|----|---------|-----------|------------|
| T01 | Inyección de prompt | Input validation | Esquemas cerrados, validación server-side |
| T02 | Exfiltración via proveedor | Data transfer | DPA, no-training, cifrado, minimización |
| T03 | Cross-tenant data leak | Isolation | Scoping por organizationId, cifrado por tenant |
| T04 | Prompt injection indirecto | RAG security | Validación de contexto recuperado |
| T05 | Modelo comprometido | Supply chain | Inventory de proveedores, version pinning |
| T06 | Credential leakage | Secrets management | Never send to AI, vault storage |
| T07 | Training on tenant data | Privacy violation | Contractual + technical controls |
| T08 | Legal hold bypass | Compliance | Segregated storage, Legal-only access |
| T09 | Retention policy evasion | Data governance | Cascade deletion, backup expiration |
| T10 | Unauthorized acceptance | Authorization | Server-side checks, optimistic concurrency |

### 11.2 Pruebas de Amenazas Requeridas

```typescript
describe('IA Data Governance Threat Tests', () => {
  it('T01: Rejects SQL injection in prompt input', async () => {
    // Test implementation
  });
  
  it('T02: Verifies no PII sent to provider without minimization', async () => {
    // Test implementation
  });
  
  it('T03: Blocks cross-tenant artifact access', async () => {
    // Test implementation
  });
  
  it('T04: Validates retrieved context before inclusion', async () => {
    // Test implementation
  });
  
  it('T06: Confirms secrets never reach AI provider', async () => {
    // Test implementation
  });
  
  it('T08: Legal hold prevents deletion until released', async () => {
    // Test implementation
  });
  
  it('T10: Requires human acceptance for canonical mutation', async () => {
    // Test implementation
  });
});
```

## 12. Decisiones No Resueltas

Las siguientes decisiones requieren aprobación antes de implementación:

| ID | Decisión | Owner Requerido | Estado | Bloqueo |
|----|----------|-----------------|--------|---------|
| OD-01 | Jurisdicciones específicas y plazos de retención (7 años es válido?) | Legal/Privacy | Pendiente | BLOCKER |
| OD-02 | Proveedores de IA aprobados inicial lista | Security + Legal | Pendiente | BLOCKER |
| OD-03 | Mecanismos de transferencia internacional (SCCs, BCRs) | Legal/Privacy | Pendiente | BLOCKER |
| OD-04 | Definición operativa de "menor de edad" por jurisdicción | Legal/Privacy | Pendiente | BLOCKER |
| OD-05 | Procedimiento de DPIA (Data Protection Impact Assessment) | Legal/Privacy | Pendiente | BLOCKER |
| OD-06 | KMS específico y estrategia de key rotation | Security | Pendiente | BLOCKER |
| OD-07 | Proveedor de índices vectoriales y su compliance | Security + Architecture | Pendiente | BLOCKER |

## 13. Checklist de Readiness

| ID | Requisito | Owner | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| CL-01 | Inventario de clasificación por tipo/tenant | Data owner + Legal | PENDIENTE | Pendiente |
| CL-02 | Mapa campo-finalidad para minimización | Data owner + Legal | PENDIENTE | Pendiente |
| CL-03 | Diseño KMS y prueba de rotación | Security | PENDIENTE | Pendiente |
| CL-04 | Matriz rol/operación/dato y pruebas cross-tenant | Architecture + Security | PENDIENTE | Pendiente |
| CL-05 | Ficha de proveedor/modelo/DPA evaluada | Security + Legal | PENDIENTE | Pendiente |
| CL-06 | Schema de logging con redacción verificada | Security | PENDIENTE | Pendiente |
| CL-07 | Policy-as-code para TTL y cascada | Data owner + Legal | PENDIENTE | Pendiente |
| CL-08 | Runbook y prueba sintética de legal hold | Records/Legal | PENDIENTE | Pendiente |
| CL-09 | Manifest de provenance/licencia versionado | Architecture + Legal | PENDIENTE | Pendiente |

## 14. Aprobaciones Requeridas

Este standard requiere aprobación explícita de:

| Disciplina | Owner Revisor | Decisión | Fecha | Versión | Condiciones | Evidencia |
|------------|---------------|----------|-------|---------|-------------|-----------|
| Arquitectura | Architecture owner | PENDIENTE | - | - | - | - |
| Seguridad | Security owner | PENDIENTE | - | - | - | - |
| Legal/Privacy | Legal/Privacy owner | PENDIENTE | - | - | - | - |

**Estado actual**: `NO-GO / BLOCKED` hasta completar las tres aprobaciones.

---

*Documento versionado. Cualquier modificación incrementa la versión y requiere nueva revisión.*
