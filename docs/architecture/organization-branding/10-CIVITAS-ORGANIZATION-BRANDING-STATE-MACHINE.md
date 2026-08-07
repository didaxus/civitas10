# CIVITAS — State machine del branding organizacional

**Código:** BRAND-10

## 1. OriginRequest

```text
submitted | approved | rejected | cancelled | expired
```

Aprobación crea origin pending y challenge.

## 2. Origin

```text
pending | verified | stale | suspended | failed | revoked | exception_approved
```

## 3. ValidationRun

```text
queued → running → passed | failed | expired → consumed
```

El run es tenant-bound, actor-bound, URL-bound, kind-bound y de un solo uso.

## 4. AssetReference

No existe mientras corre la validación inicial.

```text
inexistente → ready
ready | stale | unreachable | content_changed | blocked | archived
```

## 5. Draft

```text
draft | validating | validated | blocked
```

Editar después de publicar modifica working draft; la publicación activa permanece inmutable.

## 6. InitialPublicationRequest

```text
submitted | approved | rejected | cancelled | expired
```

Organization Admin envía para aprobación inicial. Owner aprueba o rechaza.

## 7. Publication

```text
status: active | superseded
creationReason: initial | update | rollback
```

## 8. RuntimeHealth

```text
healthy | degraded | unavailable
```

No modifica draft ni publicación.

## 9. RollbackRun

```text
queued | validating | blocked | completed | failed
```

Rollback crea una publicación nueva active con creationReason rollback.
