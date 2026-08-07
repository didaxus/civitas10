# CIVITAS — Contrato canónico de branding organizacional

**Código:** BRAND-00  
**Estado:** Congelable para implementación  
**Modelo:** URL-first, sin almacenamiento permanente

## 1. Precedencia

```text
00 Contrato → 10 State machine → 20 OpenAPI + 30 SQL → 40 Backend → 50 UI → 60 UX → 90 Gate
```

## 2. Superficies

El login puede mostrar nombre, logo, favicon, portada y colores institucionales. Debe conservar:

> **Powered by Didaxus.**  
> **Simplifying with Tech.**

Después del login, la interfaz usa marca y colores Didaxus/Civitas. La topbar solo muestra logo pequeño y nombre corto de la organización. No existe tagline organizacional dentro de Civitas.

## 3. Flujo del dominio de imágenes

```text
Organization Admin crea OriginRequest
→ Owner aprueba o rechaza una sola vez
→ sistema crea origin pending y challenge
→ Organization Admin o su equipo técnico configura DNS/well-known
→ Organization Admin solicita verificar nuevamente
→ sistema verifica automáticamente
→ origin verified
```

El Owner gestiona excepciones, suspensión, revocación, reactivación y ampliación de propósitos. No interviene en cada reintento técnico.

## 4. URL-first

La organización aloja las imágenes. Civitas conserva referencias, metadata y hash; no recibe uploads, no crea copias y no actúa como CDN o proxy permanente.

## 5. Recursos separados

```text
draftStatus: draft | validating | validated | blocked
publicationStatus: active | superseded
publicationCreationReason: initial | update | rollback
runtimeHealth: healthy | degraded | unavailable
```

Una publicación activa continúa inmutable mientras se edita el working draft.

## 6. Asset lifecycle

Durante la validación inicial no existe `AssetReference`. Existe un `ValidationRun`:

```text
queued → running → passed | failed | expired → consumed
```

Una referencia se crea directamente en `ready` después del run aprobado y del browser probe.

```text
AssetReference: ready | stale | unreachable | content_changed | blocked | archived
```

En revalidaciones, la referencia conserva su estado hasta finalizar el nuevo run.

## 7. Aprobación inicial

Organization Admin crea `InitialPublicationRequest`. Owner aprueba o rechaza. La aprobación crea atómicamente la primera publicación `active` con `creationReason = initial`.

Las publicaciones posteriores las ejecuta Organization Admin y usan `creationReason = update`. Un rollback crea una nueva publicación `active` con `creationReason = rollback`.

## 8. Origins y seguridad

El origin debe ser HTTPS, dedicado, público, anónimo, sin cookies y compatible con CORS anónimo. Backend valida DNS, CNAME, IP, redirects, bytes, formato, dimensiones, SHA-256 y headers. El browser probe ocurre después.

## 9. Rollback

```text
reference rollback ≠ binary rollback
```

## 10. Capacidades

```text
owner.organization_branding_origins.manage
owner.organization_branding_origins.exception
owner.organization_branding.initial_publish
org.organization_branding.read
org.organization_branding.update
org.organization_branding.publish
org.organization_branding_assets.manage
org.organization_branding_origin_requests.create
```

## 11. Criterio final

El paquete queda congelable cuando el gate ejecutable termina en `[branding-contract] PASS`.
