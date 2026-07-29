# ADR-005: Gobierno de datos para artefactos de IA

## Estado

Propuesto — **BLOCKED para implementar #198** hasta que Arquitectura, Seguridad y Legal/Privacy registren una aprobación humana en la tabla de revisiones de este ADR.

## Fecha

2026-07-29

## Versión del documento

`ADR-005 v0.2.0` (revisión solicitada; no aprobada). Esta versión es la unidad exacta que deben revisar los owners. Toda modificación de contenido incrementa la versión y deja sin efecto una revisión anterior hasta que la persona revisora confirme expresamente la nueva versión.

## Relacionado

- #198
- ADR-001: MCP Boundary in Civitas
- ADR-002: REST API Boundary for Civitas v1
- ADR-003: Module Catalog v2 and Federated Module Runtime

## Contexto

#198 introducirá artefactos producidos o procesados por IA. Prompts, contexto recuperado, respuestas, feedback y trazas pueden contener datos personales, confidenciales o sujetos a obligaciones contractuales. Una respuesta plausible tampoco es una decisión de negocio ni una fuente canónica. Sin un contrato previo, cada módulo podría conservar, borrar, enviar a proveedores o promover estos artefactos de forma diferente.

Este ADR fija el mínimo común antes de escribir código. Los ejemplos que contiene son deliberadamente sintéticos y redactados; no se usaron datos de producción, credenciales, identificadores reales ni contenido de una persona real.

## Decisión

Civitas tratará cada entrada, salida y derivado de IA como un artefacto gobernado, con organización, clasificación, propietario, procedencia, propósito, base de tratamiento/consentimiento cuando corresponda, política de retención y estado de legal hold explícitos.

**Ninguna respuesta de IA, acción de agente, resumen, clasificación o extracción mutará automáticamente una versión canónica o aprobada.** La salida se guarda, como máximo, como borrador no canónico. La promoción exige una acción humana autenticada e intencional sobre una comparación visible, autorización ordinaria de Civitas, validaciones de dominio y un evento de auditoría. “Aceptar” no equivale a copiar silenciosamente: crea una nueva revisión atribuida a la persona; no reescribe la respuesta original ni el historial aprobado.

La implementación de #198 permanece bloqueada hasta completar las tres revisiones requeridas al final de este documento. La aprobación del ADR no autoriza por sí sola un proveedor, una finalidad nueva ni datos de producción.

## Clasificación y minimización

La clasificación efectiva es la más restrictiva entre contenido, metadatos, fuente y derivados:

| Nivel | Contenido permitido | Tratamiento de IA |
|---|---|---|
| `PUBLIC` | Información aprobada para publicación | Permitido con proveedor aprobado y procedencia |
| `INTERNAL` | Operación interna sin datos personales sensibles | Permitido para una finalidad declarada; no entrenamiento por defecto |
| `CONFIDENTIAL` | Datos personales ordinarios, contenido educativo o comercial no público | Minimizar y redactar; cifrado, acceso por mínimo privilegio y proveedor expresamente aprobado |
| `RESTRICTED` | Categorías especiales, secretos, credenciales, datos de menores de alto riesgo, expedientes legales o material bajo hold | Denegado por defecto; sólo una excepción documentada de Seguridad y Legal/Privacy puede habilitar una finalidad y un proveedor concretos |

Credenciales, secretos, tokens, claves privadas y datos sin finalidad necesaria nunca se incluyen. Antes de invocar IA se aplica minimización, pseudonimización o redacción. Si no se puede determinar clasificación, organización, finalidad o base autorizante, se falla cerrado como `RESTRICTED`. Los derivados —incluidos embeddings, etiquetas y resúmenes— heredan clasificación y obligaciones de sus fuentes; una transformación no anonimiza por sí sola.

## Ownership y separación de responsabilidades

- El **data owner del módulo** decide finalidad, clasificación, exactitud exigida y retención dentro de la política aprobada.
- El **product owner** define el flujo de aceptación humana, pero no puede relajar clasificación ni legal hold.
- **Platform/AI** custodia el servicio, aplica los controles y conserva procedencia; no se convierte en propietario de los datos de negocio.
- **Security** aprueba amenazas, controles técnicos, logging/redacción y proveedores desde la perspectiva de seguridad.
- **Legal/Privacy** valida base de tratamiento, consentimiento cuando aplique, avisos, derechos, transferencias, retención y holds.
- **Records/Legal** crea y libera legal holds; ni usuarios, módulos, IA ni proveedores pueden liberarlos.
- La persona revisora responde por la aceptación concreta. El modelo y el proveedor nunca figuran como aprobador humano.

Todo acceso sigue la autorización canónica, el contexto de organización y el aislamiento de tenant de Civitas. El proveedor es un encargado/subprocesador reemplazable, nunca propietario ni fuente canónica.

## Contrato de provenance

Cada artefacto almacena o referencia de forma inmutable:

- `artifactId`, `organizationId`, tipo, clasificación, finalidad y propietario;
- actor humano o identidad de servicio que inició la operación, y correlation/trace ID;
- IDs y revisiones de fuentes, con hashes cuando sea necesario demostrar integridad, sin duplicar contenido en logs;
- plantilla de prompt y versión, transformaciones/redacciones aplicadas y parámetros relevantes;
- proveedor, región, modelo y versión/configuración conocidas;
- timestamps de creación y expiración, base de tratamiento/registro de consentimiento aplicable;
- relación `derivedFrom`, estado (`draft`, `accepted`, `rejected`, `expired`, `deletion_pending`, `held`) y clasificación heredada;
- decisión humana, identidad del revisor, timestamp, revisión comparada y motivo;
- política de retención, solicitud de borrado, evidencia de borrado y referencias de legal hold.

La procedencia se conserva aun cuando el contenido sea borrado, mediante una constancia mínima no reversible cuando la ley y la política lo permitan. No se registran prompts completos, respuestas completas, embeddings, secretos ni datos personales en logs generales.

## Matriz por tipo de artefacto

Los plazos son máximos por defecto, contados desde creación o última decisión indicada. Legal/Privacy puede exigir un plazo menor o una obligación legal documentada puede exigir uno mayor. `0 días` significa procesamiento efímero sin persistencia de contenido por Civitas ni el proveedor.

| Artefacto | Clasificación mínima | Owner / fuente de verdad | Retención por defecto | Borrado y hold | Aceptación humana / transferencia |
|---|---|---|---|---|---|
| Prompt de sistema/plantilla sin datos de tenant | `INTERNAL` | Platform/AI; repositorio versionado | Vida de la versión + 2 años | Borrar al expirar si no está bajo hold | Cambio por revisión de código; proveedor recibe sólo la versión necesaria |
| Entrada del usuario y contexto recuperado | Heredada de la fuente, mínimo `CONFIDENTIAL` si contiene datos personales | Módulo fuente; el artefacto IA es copia no canónica | 30 días; preferir `0 días` | Propaga solicitudes de borrado; hold preserva sólo el alcance identificado | No aplica para canon; transferencia sólo minimizada y autorizada |
| Prompt renderizado | Máxima de plantilla, entrada y contexto | Platform/AI como custodio | `0 días`; hasta 30 días sólo para investigación aprobada | Eliminación coordinada local/proveedor; hold requiere captura segregada | Nunca se acepta como dato de negocio |
| Respuesta cruda del modelo | Heredada de todas las entradas | Data owner del módulo; nunca fuente canónica | 30 días | Borrar con entradas o al expirar; si hay hold pasa a almacén segregado | Siempre borrador; proveedor sin uso secundario |
| Borrador presentado/editado por una persona | Heredada de fuentes y respuesta | Módulo de negocio | 90 días desde última edición o rechazo | Borrable salvo hold; conservar sólo la revisión aceptada si la política del registro lo exige | Requiere comparación visible y aceptación explícita para promover |
| Revisión canónica creada tras aceptación | Según el registro de negocio | Owner canónico existente; no Platform/AI | Política del registro canónico, no la del modelo | Flujo de borrado/hold del registro canónico | Aprobador humano, permiso, motivo y versión quedan auditados |
| Feedback, rating o corrección | `CONFIDENTIAL` si es atribuible; hereda si incluye contenido | Product owner | 180 días; luego agregar o anonimizar de forma verificada | Borrar vínculo personal y contenido; agregado anónimo queda fuera sólo tras verificación | Consentimiento separado si se reutiliza para evaluación/entrenamiento |
| Embedding, índice vectorial, caché o feature derivada | Heredada de cada fuente | Owner de la fuente; Platform como custodio | No más que la fuente; caché ≤ 24 horas | Borrado en cascada y reconstrucción del índice; hold conserva copia segregada | No es canon ni prueba; no transferencia independiente |
| Log operativo redacted | `INTERNAL`, o mayor si un campo residual lo exige | Security/Platform | 30 días online + 335 días en archivo restringido | Borrar/anonimizar identificadores cuando proceda; hold por rangos/eventos concretos | Sin contenido; acceso sólo operativo |
| Evento de auditoría de aceptación, borrado, acceso o hold | `CONFIDENTIAL` | Security/Compliance | 7 años, sujeto a validación jurisdiccional | Append-only; seudonimizar datos no necesarios; hold prevalece | Registra actor humano; no se envía al proveedor de IA |
| Copia temporal del proveedor y metadatos de inferencia | Misma que el artefacto transferido | Civitas/data owner; proveedor como encargado | `0 días` por defecto; máximo contractual ≤ 30 días para abuso/seguridad aprobado | API/SLA de borrado y certificado; hold sólo mediante instrucción legal documentada | DPA, región y subprocesadores aprobados; sin entrenamiento |
| Evidencia de consentimiento o de su retirada | `CONFIDENTIAL` | Legal/Privacy | Duración del tratamiento + plazo de defensa aprobado | Minimizar; una retirada detiene tratamiento futuro, sin destruir evidencia u objetos bajo hold | Captura humana verificable y versionada |

Los plazos de 7 años y cualquier extensión jurisdiccional son **blockers pendientes de validación Legal/Privacy**, no una afirmación de obligación universal.

## Retención, deletion y conflicto con legal hold

La retención se implementa como política ejecutable por tipo, tenant y jurisdicción, con expiración automática y evidencia. Una copia de seguridad no reinicia el plazo: los objetos expirados quedan suprimidos al restaurar y desaparecen por rotación documentada. Índices, cachés, DLQ, exports y copias del proveedor forman parte del alcance.

Orden determinista ante `deletion-versus-hold`:

1. Una solicitud válida de borrado marca el objeto y todos sus derivados como `deletion_pending`, bloquea nuevo uso de IA, nuevas copias y promoción a canon, y registra alcance y deadline.
2. El motor comprueba holds activos por identificador y alcance; no basta una etiqueta libre. Si no hay hold, borra contenido y derivados en todos los almacenes/proveedores dentro del SLA aprobado, conserva sólo evidencia mínima permitida y verifica el resultado.
3. Si existe hold, **el hold prevalece temporalmente sólo para el contenido y periodo cubiertos**. El contenido pasa a almacenamiento segregado, cifrado e inmutable, con acceso exclusivo de Legal; se borra de índices de búsqueda, cachés y flujos de IA. El sistema registra que el borrado está suspendido, la autoridad, el alcance y la fecha de revisión, sin revelar materia privilegiada al solicitante.
4. Datos fuera del alcance del hold se borran normalmente. Está prohibido usar un hold global por conveniencia, ampliar su alcance automáticamente o conservar copias operativas “por si acaso”.
5. Sólo Records/Legal puede liberar el hold. La liberación dispara automáticamente la solicitud pendiente; no requiere que la persona la repita. Se ejecuta el borrado, se solicita al proveedor, se verifica y se audita la finalización.
6. Si obligaciones legales compiten, Legal/Privacy documenta la base, alcance, decisión y siguiente revisión. El código falla cerrado y escala; ni el modelo ni un operador técnico resuelven el conflicto.

## Transferencias a proveedores

Antes de cualquier transferencia deben existir inventario y evaluación del proveedor, DPA, instrucciones de tratamiento, región y mecanismo de transferencia aprobados, lista/notificación de subprocesadores, cifrado en tránsito y reposo, aislamiento de tenant, controles de acceso, SLA de incidente y borrado, asistencia a derechos/holds y derecho de auditoría. La configuración contractual y técnica debe impedir entrenamiento, fine-tuning, retención o uso secundario con datos Civitas salvo decisión nueva, específica y aprobada.

Se envía el mínimo campo necesario; los IDs se pseudonimizan y no se envían secretos ni datos `RESTRICTED` por defecto. No hay transferencia encadenada a herramientas/plugins no inventariados. Un cambio de modelo, región, términos o subprocesador invalida la aprobación hasta reevaluación. Si no puede demostrarse borrado o `0 días`, el flujo queda bloqueado o usa una alternativa aprobada.

## Logging y monitorización

Los logs estructurados usan IDs opacos y registran operación, tenant, clasificación, política, proveedor/modelo, latencia, tokens/coste, resultado de controles, decisión humana y eventos de borrado/hold. Aplican allowlist de campos, redacción antes de emitir, cifrado, acceso por rol, alertas de exfiltración y pruebas periódicas de canarios sintéticos. Quedan prohibidos el contenido completo, authorization headers, cookies, secretos, prompts/respuestas y datos de fuentes en excepciones o traces.

El acceso al almacén segregado, cambios de políticas, exportaciones, aceptaciones, rechazos, reintentos, transferencias, borrados y holds generan auditoría append-only. Las métricas agregadas no se consideran anónimas hasta que Privacy valide riesgo de reidentificación.

## Consentimiento, avisos y derechos

Legal/Privacy determina y documenta la base de tratamiento por finalidad; el consentimiento no se usa como comodín cuando no es libre, específico, informado e inequívoco. Cuando sea obligatorio, la UI muestra finalidad, categorías de datos, proveedor/transferencia, retención, carácter opcional y cómo retirar antes de enviar datos. Se versionan aviso y manifestación afirmativa; casillas premarcadas, silencio o aceptación de términos generales no cuentan.

Retirar consentimiento detiene futuras inferencias y reutilización para esa finalidad, inicia borrado cuando corresponda y no revierte decisiones canónicas válidamente adoptadas; éstas siguen su proceso de corrección/borrado y hold. Los flujos deben permitir acceso, corrección, oposición, portabilidad o borrado aplicables y evitar decisiones exclusivamente automatizadas de efecto significativo salvo revisión y base expresamente aprobadas. Para menores o representación, se valida capacidad/autoridad sin inferirla del contenido.

## Aceptación humana y no mutación canónica

La interfaz debe separar visualmente **fuente**, **salida IA no confiable** y **versión propuesta**, señalando incertidumbre y campos modificados. Antes de aceptar, una persona autorizada puede editar, debe ver diff y fuentes/procedencia, y confirma una acción específica sin selección masiva por defecto. Para acciones de alto impacto se exige doble control o el flujo de aprobación ya definido por el dominio.

La aceptación ejecuta un comando normal del módulo con validación de versión optimista, políticas y autorización server-side. Si cambió la revisión fuente, se rechaza y se pide nueva revisión. El comando crea una revisión canónica nueva y enlaza la procedencia; nunca permite que el proveedor escriba directamente, que un webhook/promesa de tool-call se interprete como aprobación, ni que un timeout/retry promueva contenido. Rechazo, abstención y expiración no mutan canon.

Ejemplo sintético y redactado: una respuesta propone cambiar `contacto-[REDACTED]` de estado `A` a `B`. Civitas muestra el diff y las fuentes sintéticas; hasta que `reviewer-demo` confirme con permiso vigente, la revisión canónica sigue en `A`. La respuesta nunca contiene ni representa datos reales.

## Consecuencias

- Habrá mayor coste de almacenamiento segregado, trazabilidad, borrado en cascada y revisión humana.
- Las integraciones incapaces de ofrecer no-entrenamiento, borrado verificable, región y procedencia quedarán fuera.
- La IA puede acelerar borradores, pero no sustituye ownership, autorización ni responsabilidad humana.
- #198 deberá entregar esquemas y pruebas para herencia de clasificación, ausencia de mutación automática, redacción de logs, expiración, borrado en cascada, hold/release y rechazo de proveedores no aprobados.

## Alternativas rechazadas

- **Guardar todo para mejorar el modelo:** viola minimización, límites de finalidad y borrado.
- **Tratar respuestas como temporales no gobernadas:** los temporales, cachés y derivados también pueden contener datos regulados.
- **Promoción automática con opción de deshacer:** el daño o decisión ya habría ocurrido y “undo” no constituye aceptación previa.
- **Borrar siempre aunque exista hold:** puede destruir evidencia sujeta a preservación.
- **Conservar todo ante cualquier hold:** excede el alcance, impide derechos y crea un repositorio de riesgo.
- **Confiar sólo en controles del proveedor:** Civitas sigue siendo responsable de su autorización, canon, evidencias y ciclo de vida.

## Revisión obligatoria, blockers y registro de decisión

No se atribuye una aprobación a personas que no la hayan emitido. Cada revisor debe sustituir `Pendiente`, añadir identidad/fecha y enlazar evidencia verificable. Un comentario informal o aprobación del PR sin disciplina indicada no satisface el gate.

| Disciplina | Owner revisor requerido | Estado | Blockers que debe resolver | Evidencia/decisión |
|---|---|---|---|---|
| Arquitectura | Architecture owner | **Pendiente — BLOCKER** | Integración con owners canónicos; esquema de provenance; límites de tenant; comando de aceptación; concurrencia y cascada de derivados | Pendiente de revisión humana |
| Seguridad | Security owner | **Pendiente — BLOCKER** | Threat model; `RESTRICTED` fail-closed; secretos/redacción; cifrado y RBAC; proveedor; borrado/hold verificables; abuso y supply chain | Pendiente de revisión humana |
| Legal/Privacy | Legal/Privacy owner | **Pendiente — BLOCKER** | Bases/finalidades; consentimiento y menores; plazos (incluidos 7 años); derechos; DPA, región/subprocesadores; transferencias; definición y liberación de holds | Pendiente de revisión humana |

### Solicitudes de revisión humana

Se solicita expresamente, sin presumir respuesta, que:

1. el **Architecture owner** revise `ADR-005 v0.2.0`, resuelva `OD-01`, `OD-02` y la integración canónica, y emita `Aprobado`, `Aprobado con condiciones` o `Rechazado`;
2. el **Security owner** revise `ADR-005 v0.2.0`, el threat model y los controles/proveedor todavía no seleccionados, y emita una de esas decisiones;
3. el **Legal/Privacy owner** revise `ADR-005 v0.2.0`, determine si se activa una DPIA y valide base, transferencias, plazos, derechos y holds antes de emitir una decisión.

La solicitud no es una aprobación. CI verde, merge, firma de contrato, ausencia de comentarios, autoría o coautoría del ADR y aprobación genérica de un PR **no** satisfacen estas solicitudes.

### Registro de aprobaciones reales

No hay aprobaciones humanas registradas para `ADR-005 v0.2.0` al 2026-07-29. Sólo se añade una fila cuando existe evidencia inequívoca emitida por la persona; no se crean filas placeholder ni se infiere identidad.

| Identidad humana verificable | Rol/owner | Fecha ISO-8601 | Versión revisada | Decisión | Condiciones y estado | Evidencia inmutable |
|---|---|---|---|---|---|---|
| _Ninguna_ | — | — | — | — | — | — |

Una aprobación condicionada no cambia el gate: cada condición se registra con owner, deadline y evidencia de cierre; luego la misma disciplina confirma su cierre sobre la versión vigente. Una cuenta de servicio, bot, proveedor, test o firma contractual no puede ocupar `Identidad humana verificable`.

**Decisión registrada al 2026-07-29:** `NO-GO / BLOCKED`. Se acepta este texto únicamente como propuesta de baseline para revisión; **no se autoriza implementar ni activar #198 con datos, proveedores o usuarios reales**. El cambio a `Accepted / GO` requiere las tres decisiones `Aprobado`, cero blocker abierto, enlaces a evidencias, y una última resolución explícita del Architecture owner. Cualquier aprobación condicionada mantiene `BLOCKED` hasta cerrar y registrar la condición.

## Checklist trazable de readiness

Leyenda: `[x]` significa que el ADR define el requisito, **no** que el control esté implementado o aprobado. `Estado` refleja evidencia real a la fecha. Ningún ítem `PENDIENTE` puede reinterpretarse como PASS por CI o revisión documental.

| ID | Dominio | Requisito verificable | Owner humano que acepta | Evidencia exigida | Estado |
|---|---|---|---|---|---|
| CL-01 | Clasificación | [x] Inventario por tipo, tenant y finalidad; máxima clasificación heredada; desconocido=`RESTRICTED` | Data owner + Legal/Privacy | inventario versionado y casos de herencia/fail-closed | **PENDIENTE / BLOCKER** |
| CL-02 | Minimización | [x] Allowlist de campos, redacción/pseudonimización previa y justificación campo-finalidad | Data owner + Legal/Privacy | mapa campo-finalidad y prueba con fixtures sintéticos | **PENDIENTE / BLOCKER** |
| CL-03 | Encryption | [x] TLS en tránsito, cifrado en reposo, claves por entorno, rotación, backup y almacén de hold cubiertos | Security owner | diseño KMS, versiones/configuración y prueba de rotación/recuperación | **PENDIENTE / BLOCKER** |
| CL-04 | Access | [x] Tenant isolation, mínimo privilegio, autorización server-side, acceso break-glass temporal y revisión periódica | Architecture + Security | matriz rol/operación/dato, pruebas cross-tenant y acta de access review | **PENDIENTE / BLOCKER** |
| CL-05 | Provider transfer | [x] DPA, región, mecanismo, subprocesadores, no-training, borrado, incidente y cambio material evaluados | Security + Legal/Privacy | ficha de versión de proveedor/modelo/términos/DPA y evaluación firmada | **PENDIENTE / BLOCKER** |
| CL-06 | Logging | [x] Esquema allowlist sin contenido/secretos, redacción antes de emitir, auditoría append-only y alertas | Security owner | schema versionado, canarios sintéticos y prueba de acceso/integridad | **PENDIENTE / BLOCKER** |
| CL-07 | Retention/deletion | [x] TTL por artefacto, cascada a derivados/backups/DLQ/proveedor, restauración y certificado verificables | Data owner + Legal/Privacy | policy-as-code y pruebas de expiración, restore y DSAR end-to-end | **PENDIENTE / BLOCKER** |
| CL-08 | Legal hold | [x] Alcance identificable, segregación, Legal-only, liberación autorizada y reanudación automática de borrado | Records/Legal | runbook y prueba sintética hold/release/deletion pending | **PENDIENTE / BLOCKER** |
| CL-09 | Provenance/license | [x] Fuentes, hashes, prompt/modelo/config y transformaciones; licencia y límites de reutilización por fuente | Architecture + Legal/Privacy | manifest de provenance/licencia versionado y muestreo trazable | **PENDIENTE / BLOCKER** |
| CL-10 | Human acceptance | [x] Diff/fuentes visibles, identidad y permiso vigentes, versión optimista, motivo y nueva revisión canónica | Product + Architecture | test de no-mutación para output/retry/tool/webhook y evento auditado | **PENDIENTE / BLOCKER** |

## Decisiones abiertas

| ID | Decisión pendiente | Opciones que deben evaluarse | Owner de decisión | Criterio/evidencia de cierre | Estado |
|---|---|---|---|---|---|
| OD-01 | Esquema/store de artefactos y provenance | almacén dedicado o extensión gobernada por módulo | Architecture | ADR/schema versionado, aislamiento y cascada demostrados | **ABIERTO / BLOCKER** |
| OD-02 | Semántica de concurrencia y aceptación de alto impacto | optimistic lock; doble control por capacidad | Architecture + Product | operaciones clasificadas y pruebas stale/double-control | **ABIERTO / BLOCKER** |
| OD-03 | Proveedor, modelo, región y versión | ninguno seleccionado; alternativa local incluida | Security + Legal/Privacy | evaluación sobre versiones y términos exactos | **ABIERTO / BLOCKER** |
| OD-04 | Base jurídica y aviso por finalidad/jurisdicción | contrato, obligación, interés legítimo o consentimiento según proceda | Legal/Privacy | RoPA/finalidad y texto de aviso versionados | **ABIERTO / BLOCKER** |
| OD-05 | Retención de auditoría y SLA de borrado | 7 años propuestos y SLAs aún no validados | Legal/Privacy | schedule jurisdiccional aprobado y executable policy | **ABIERTO / BLOCKER** |
| OD-06 | Reutilización para evaluación/fine-tuning | prohibida por defecto o finalidad separada | Legal/Privacy + Data owner | evaluación nueva; no-training permanece mientras esté abierto | **ABIERTO / BLOCKER** |

## Triggers de threat model y DPIA

El **threat model es obligatorio antes del primer piloto**, y se reabre ante un modelo/proveedor/región/subprocesador nuevo, tool use o RAG nuevo, acceso a otra clase de datos, cambio de frontera de tenant/trust, ejecución de acciones, fine-tuning, plugins, nuevas rutas de exportación o incidente. Debe cubrir como mínimo prompt injection indirecta, exfiltración, confused deputy, cross-tenant leakage, poisoning, insecure output/tool execution, supply chain, abuso, disponibilidad, secretos, reidentificación y borrado/hold incompletos. Security registra versión, assets/DFD, supuestos, amenazas, mitigaciones, riesgo residual y aceptante humano.

Legal/Privacy debe hacer y registrar el **screening DPIA antes de datos reales**. Disparan DPIA completa, como mínimo: datos `RESTRICTED` o de categorías especiales; menores o personas vulnerables; evaluación/perfilado, monitoring sistemático o decisión con efecto significativo; combinación de datasets, inferencias nuevas o gran escala; biometría; transferencia internacional o proveedor/subprocesador nuevo; tecnología novedosa con alto riesgo; imposibilidad práctica de ejercer derechos; o riesgo residual alto del threat model. La ausencia de trigger también requiere conclusión humana documentada con versión y fecha; no la decide el equipo técnico ni CI.

## Baselines y referencias versionadas

Esta propuesta se revisa contra versiones concretas, no contra “latest” implícito:

- `ADR-005 v0.2.0`, 2026-07-29 (este documento; **propuesto**);
- ADR-001, estado `Accepted` (versión de repositorio en el commit que apruebe este ADR; falta fijar SHA en `OD-01`);
- ADR-002, Civitas REST API `v1`, 2026-07-17;
- ADR-003, Module Catalog `v2`, 2026-07-22;
- taxonomía de Data Scope `v2` y pipeline de autorización `v2` de Phase 3;
- NIST AI RMF `1.0` (2023), NIST AI 600-1 `1.0` (2024), ISO/IEC 27001:2022 e ISO/IEC 42001:2023 como referencias de control, **no como certificaciones de Civitas**.

Proveedor, modelo, API, región, DPA, términos, lista de subprocesadores, KMS/cipher suite, esquema de logs, policy de retención y threat model están **SIN VERSIÓN / NO SELECCIONADOS** y son blockers. Antes de revisión final, cada evidencia debe identificar nombre, versión/fecha, digest o URL inmutable y owner; una referencia flotante no cierra un ítem.

## Checklist de salida para #198

- [ ] Arquitectura aprobó y no quedan blockers.
- [ ] Seguridad aprobó threat model, proveedor y controles verificables.
- [ ] Legal/Privacy aprobó finalidades, plazos, transferencias, consentimiento/derechos y procedimiento de hold.
- [ ] Matriz se materializó en políticas ejecutables y tests con fixtures sólo sintéticos/redactados.
- [ ] Pruebas demuestran que outputs, retries, tools y webhooks no mutan canon sin aceptación humana.
- [ ] Borrado incluye derivados/proveedor y la liberación de hold reanuda solicitudes pendientes.
- [ ] Observabilidad no captura contenido ni secretos y se verificó con canarios sintéticos.

