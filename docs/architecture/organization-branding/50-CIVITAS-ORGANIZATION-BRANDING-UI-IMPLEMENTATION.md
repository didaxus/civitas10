# CIVITAS — Implementación UI del branding organizacional

**Código:** BRAND-50
**Stack:** React 19, TypeScript, Vite 8, Tailwind CSS 4

## Frontera

La UI no implementa DNS, SSRF, hash, CSP server-side, workers ni persistencia.

## Wizard

```text
1. Fuente de imágenes
2. Solicitud y verificación
3. Registrar imágenes
4. Preview
5. Publicar
```

## Responsabilidades

- API clients generados desde OpenAPI.
- Formularios y estados visibles.
- Browser probe posterior a validación backend.
- Preview aislado.
- Renderer compartido.
- Publicación.
- Fallbacks y accesibilidad.

## Reglas

La UI consulta capacidades, no nombres de rol.

La UI usa ETag/If-Match para drafts y no implementa lógica de autorización de backend.
