# CIVITAS — Implementación backend del branding organizacional

**Código:** BRAND-40

Backend implementa OriginRequest, origins, validaciones, references, drafts, InitialPublicationRequest, publicaciones, rollback, CSP, workers, outbox y auditoría.

No define componentes React ni copy UX.

## Responsabilidades

- OriginRequest y decisiones Owner.
- Verificación DNS TXT y well-known.
- Validación SSRF-safe.
- Validation runs.
- Asset references.
- Working drafts.
- Primera publicación y posteriores.
- Rollback.
- CSP tenant-bound.
- Runtime health.
- Workers, outbox, auditoría, retries y DLQ.

## Frontera de seguridad

Backend valida HTTPS, DNS/CNAME, IP pública, redirects, bytes, formato, dimensiones, SHA-256, CORS y headers de privacidad.

Los bytes temporales se descartan al finalizar la validación.

## Persistencia

- drafts con concurrencia optimista.
- publicaciones inmutables.
- validation runs de un solo uso.
- recursos tenant-bound.

## Operación

Workers:

```text
brand-origin-verification
brand-origin-revalidation
brand-asset-validation
brand-asset-revalidation
brand-initial-publication
brand-publication
brand-rollback
brand-runtime-health
```

Los eventos se escriben mediante outbox dentro de la transacción.
