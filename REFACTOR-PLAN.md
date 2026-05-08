# Plan de refactorización — Pre-existing Issues

**Fecha:** 2026-05-05
**Auditor:** Claude Code (auditoría estática sobre branch `feat/b2.0-tenant-scope-defense`)
**Documento fuente:** `PREEXISTING-ISSUES.md`

---

## Resumen

- **Confirmados accionables:** 6 / 8
- **Derivados (mismo root cause):** 1 (Issue #6 → resuelto por Fix #4)
- **Descartados con razón:** 1 (Issue #8, impacto nulo)
- **No reproducibles / Obsoletos:** 0

Todos los veredictos se apoyan en evidencia citada (archivo:línea). El entorno WSL local no expone `docker` ni `redis-cli`, así que la verificación de Issue #1 es estática (config de ioredis), no observacional.

---

## Plan priorizado (CONFIRMADO + MITIGADO)

El orden no sigue el documento original, sino el impacto real verificado: primero los que rompen flujo de usuario (#3, #2), luego los que ensucian dev/logs (#1, #4, #5), y al final el que solo afecta CI (#7).

---

### Fix 1 — [P1] Subir cap de `limit` en `LeadsQueryDto` (size: XS)

- **Issue origen:** #3
- **Archivo:** `apps/api/src/leads/dto/leads-query.dto.ts:43`
- **Cambio:** Reemplazar `@Max(100)` por `@Max(500)`. Cuatro callers del dashboard envían `limit=200` para poblar dropdowns de bulk-send y proactive messages — un cap de 500 cubre ese caso sin abrir la puerta a fetches abusivos.
- **Callers verificados:**
  - `apps/dashboard/app/dashboard/proactive/page.tsx:129`
  - `apps/dashboard/app/dashboard/whatsapp/page.tsx:278`
  - `apps/dashboard/components/proactive/ProactiveMessageSender.tsx:66`
  - `apps/dashboard/components/proactive/BulkProactiveMessageSender.tsx:96`
- **Verificación:** `curl "http://localhost:3003/leads?limit=200"` debe devolver 200 (con auth). Tests existentes en `leads.service.spec.ts` siguen pasando.
- **Depende de:** ninguno
- **Nota:** La alternativa "más correcta" sería paginar el dropdown, pero eso es un cambio mayor en 4 componentes. Subir el cap es el fix mínimo y atómico que el documento pide.

---

### Fix 2 — [P1] No cachear `null` en `resolveActiveTenantId` (size: XS)

- **Issue origen:** #2
- **Archivo:** `apps/dashboard/lib/auth/tenant-lookup.ts:50-55`
- **Cambio:** Cuando `tenant` es `null`, **no escribir en `tenantCache`** (o cachear con TTL corto, ej. 2s). La causa raíz del 403 intermitente es una race entre el primer login del usuario y la llegada del webhook `organization.created` al API de Hetzner: el dashboard pregunta "¿qué tenantId corresponde a `org_X`?", Postgres aún no tiene la fila, retornamos `null`, y el `Map` lo guarda durante 60 segundos. Mientras tanto el webhook llega, la fila se crea, pero el proxy sigue devolviendo 403 por un minuto.
- **Diff propuesto (orientativo):**
  ```ts
  const tenantId = tenant?.id ?? null;
  if (tenantId !== null) {
    tenantCache.set(orgId, { tenantId, expiresAt: now + TENANT_CACHE_TTL_MS });
  }
  return tenantId;
  ```
- **Verificación:** Crear una org nueva en Clerk Dashboard, entrar inmediatamente al dashboard antes del webhook, abrir WhatsApp Manager. El primer GET `/api/whatsapp/sessions` puede dar 403, pero refrescar 1-2 segundos después debe dar 200 sin esperar 60s.
- **Depende de:** ninguno
- **Aclaración importante:** El issue original especulaba HMAC/timestamp/tenantId-en-header. La auditoría descartó esa hipótesis: `apps/dashboard/app/api/whatsapp/[...path]/route.ts:33-39` retorna 403 **explícitamente** cuando `resolveActiveTenantId()` es `null`, antes de firmar HMAC. La firma está bien.

---

### Fix 3 — [P2] Cambiar default `PUPPETEER_HEADLESS` a `true` (size: XS)

- **Issue origen:** #4 (resuelve también el #6 — ver "Descartados")
- **Archivo:** `.env.example:134`
- **Cambio:** `PUPPETEER_HEADLESS=false` → `PUPPETEER_HEADLESS=true`. Actualizar comentario de la línea 132 para reflejar que el default ahora protege el flujo dev (mencionar que para debug visual hay que opt-in). Opcionalmente añadir el mismo override en `apps/whatsapp-service/.env.example` si existe (verificar).
- **Por qué este es el fix correcto:** `puppeteer.config.ts:103` ya tiene la lógica `devtools = !isProduction && !headless`, así que cualquier dev que haga `cp .env.example .env` hereda DevTools abiertos y el bug de "Execution context destroyed" descrito en CLAUDE.md.
- **Verificación:** Hacer `cp .env.example .env.test`, cargar las vars, arrancar whatsapp-service. El log debe imprimir `Puppeteer config: headless=true, ..., devtools=false`.
- **Depende de:** ninguno

---

### Fix 4 — [P1] Añadir `keepAlive` a la config de ioredis (size: XS)

- **Issue origen:** #1
- **Archivo:** `apps/whatsapp-service/src/config/redis.ts:7-13`
- **Cambio:** Agregar `keepAlive: 30000` al objeto `sharedRedisOptions`. Opcionalmente `enableReadyCheck: true` (default ya es `true` en ioredis ≥4, pero hacerlo explícito documenta la intención).
- **Diff propuesto (orientativo):**
  ```ts
  const sharedRedisOptions = {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    connectTimeout: 10000,
    commandTimeout: 5000,
    keepAlive: 30000,            // ← TCP keepalive cada 30s para sobrevivir
                                 //   al timeout idle del bridge WSL/Docker
  };
  ```
- **Por qué funciona:** El bridge de red de Docker Desktop en WSL2 corta conexiones TCP idle (~60s típico). Sin keepalive, el socket de pub/sub queda colgado, el OS lo cierra con RST, y ioredis lo loguea como `ECONNRESET` antes de reconectar. Con keepalive activo, el kernel envía paquetes de mantenimiento cada 30s y la conexión nunca queda idle el suficiente tiempo como para que el bridge la mate.
- **Verificación:** `pnpm dev` y dejar el whatsapp-service idle 5 minutos. Los logs no deberían mostrar más `Redis publisher error: read ECONNRESET` ni `Redis publisher connected` en loop.
- **Depende de:** ninguno
- **Riesgo:** Bajo. `keepAlive` es una opción estándar de ioredis y no afecta producción (donde Hetzner Redis convive en localhost del mismo host y no sufre el problema del bridge WSL).

---

### Fix 5 — [P2] Script `dev:clean` para liberar puertos (size: S)

- **Issue origen:** #5
- **Archivo:** `package.json` (raíz, sección `scripts`)
- **Cambio:** Añadir entradas `dev:clean` y `predev` que maten procesos en 3001/3002/3003 antes de arrancar Turbo.
- **Diff propuesto (orientativo):**
  ```json
  "dev:clean": "npx kill-port 3001 3002 3003 || true",
  "predev": "pnpm dev:clean",
  "dev": "turbo run dev"
  ```
  `kill-port` ya viene como dependencia transitiva en muchos repos Next, pero si no está disponible se puede usar `npx -y kill-port@2` para evitar instalar nada.
- **Verificación:** Arrancar `pnpm dev`, dejarlo abierto, abrir otra terminal y volver a hacer `pnpm dev`. El segundo intento debe matar los procesos del primero y arrancar limpio en lugar de fallar con `EADDRINUSE`.
- **Depende de:** ninguno
- **Riesgo:** Cuidado con un dev que tenga otro servicio legítimo en 3001-3003 (por ejemplo, un Next standalone). Documentar el comportamiento en CLAUDE.md sección "Quick Start".

---

### Fix 6 — [P3] Cierre limpio de Jest workers (size: XS)

- **Issue origen:** #7
- **Archivo:** `apps/whatsapp-service/jest.config.js`
- **Cambio:** Añadir `forceExit: true` y `detectOpenHandles: false` (ya es default, pero explícito). Esta es la opción pragmática del propio documento. La opción "correcta" (añadir `globalTeardown` que cierre `redisClient.disconnect()` + Prisma) requiere refactor mayor y el beneficio no lo justifica mientras los tests sean unitarios mockeados.
- **Diff propuesto (orientativo):**
  ```js
  module.exports = {
    // ...
    forceExit: true,
  };
  ```
- **Verificación:** `pnpm --filter @leadcrm/whatsapp-service test` no debe imprimir el warning `A worker process has failed to exit gracefully...`. Los tests siguen pasando (62/62 esperados).
- **Depende de:** ninguno
- **Trade-off documentado:** `forceExit: true` esconde leaks reales. Cuando se introduzcan tests de integración con Redis/Prisma de verdad (no mockeados), revisar para reemplazarlo por un `globalTeardown` apropiado. Por ahora todos los specs son unitarios o usan mocks (`auth.spec.ts`, `tenant-guard.spec.ts`, `redis.spec.ts`, etc.).

---

## Descartados con razón

- **Issue #6 — WhatsApp sesiones inestables en dev**: derivado del mismo root cause que #4 (`PUPPETEER_HEADLESS=false` por default deja DevTools visibles, lo que rompe el QR flow y el `Client.sendMessage` posterior). No requiere fix independiente: aplicar Fix 3 lo elimina. Si después de Fix 3 reaparecen problemas crear/eliminar sesión, hay otro root cause y abrir issue separado.

- **Issue #8 — Docs app EADDRINUSE 3004**: el propio documento marca impacto **nulo** ("la app docs es una página estática de enlaces, no se usa en desarrollo activo"). Cambiar `apps/docs/package.json:7 --port 3004` es trivial pero el costo de incluirlo en el plan (y el ruido en el changelog) supera el beneficio. Si en algún momento la app docs vuelve a ser relevante o el puerto 3004 entra en conflicto con otra cosa, mover a 3005.

---

## Orden de ejecución sugerido

Todos los fixes son independientes (ninguno bloquea a otro), pero el orden recomendado por **ratio impacto/esfuerzo** es:

1. **Fix 1** (XS, P1) — desbloquea inmediatamente el dropdown de bulk send
2. **Fix 3** (XS, P2) — elimina dolor de dev local y resuelve Issue #6 de regalo
3. **Fix 4** (XS, P1) — limpia logs y elimina overhead de reconnect
4. **Fix 2** (XS, P1) — resuelve race condition con webhook Clerk
5. **Fix 6** (XS, P3) — limpia warning de Jest
6. **Fix 5** (S, P2) — añade conveniencia DX

Esfuerzo total estimado: ~2 horas para los 6 fixes, agrupables en 1-2 commits temáticos:
- Commit "fix: dev ergonomics" → Fixes 3, 4, 5, 6
- Commit "fix: tenant resolution + leads pagination" → Fixes 1, 2

---

## Notas de auditoría

- La verificación de Issue #1 es **estática** (config de ioredis). El entorno WSL del auditor no expone `docker` ni `redis-cli`, así que no se pudo confirmar empíricamente la presencia de `ECONNRESET` en logs. La hipótesis es la más probable dada la combinación WSL2 + Docker bridge + ausencia de keepAlive, pero si tras aplicar Fix 4 los flaps persisten, investigar también:
  - `docker logs leadscrm-redis` para errores del lado server
  - `appendonly yes` con disk lleno
  - Memory pressure del container

- Issue #2 fue el hallazgo más relevante: el documento original especulaba HMAC/timestamp/tenantId-en-header, pero la causa real es completamente distinta. El fix propuesto (no cachear negativos) es de una línea pero resuelve el síntoma sin tocar la firma criptográfica.
