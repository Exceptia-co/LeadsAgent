# Issues Pre-existentes — LeadsCRM

**Fecha detección:** 2026-05-05 (smoke local durante B2 branch)
**Branch de referencia:** `develop` (estos issues existen ANTES de B2)
**Detectados por:** Smoke test local con Chrome MCP + logs + network monitoring

---

## P1 — Alto impacto

### 1. Redis connection flapping (ECONNRESET loop)

- **Ubicación:** whatsapp-service logs en dev (`pnpm dev`)
- **Síntoma:** `Redis publisher error: read ECONNRESET` cada ~2 segundos, seguido de reconnect exitoso, seguido de otro ECONNRESET. Loop infinito.
- **Impacto:** Logs saturados, posible pérdida de mensajes pub/sub durante los cortes, overhead de reconnect continuo.
- **Causa probable:** Docker Redis en puerto 6381 con ioredis tiene issues de estabilidad en dev local. Puede ser timeout config, keepalive, o el container reiniciándose.
- **Cómo reproducir:** `docker compose up -d && pnpm dev` → observar logs de whatsapp-service.
- **Investigar:**
  - Config ioredis en `apps/whatsapp-service/src/config/redis.ts` — ¿keepAlive habilitado?
  - Docker healthcheck del container Redis
  - `docker logs leadscrm-redis` para errores del lado server
  - Probar con `redis-cli ping` durante los flaps

### 2. WhatsApp proxy 403/Unauthorized intermitente

- **Ubicación:** `apps/dashboard/contexts/WhatsAppContext.tsx:52` → `GET /api/whatsapp/sessions` → 403
- **Síntoma:** El proxy Next.js en `app/api/whatsapp/[...path]/route.ts` a veces devuelve 403 al intentar cargar sesiones WhatsApp. Los endpoints directos del NestJS API (leads, templates, ai-agents) funcionan con 200.
- **Impacto:** WhatsApp Manager puede no cargar sesiones al primer intento. Refresh a veces lo resuelve.
- **Causa probable:** El proxy firma requests con HMAC para el whatsapp-service. La firma puede fallar si:
  - El `WHATSAPP_SERVICE_HMAC_SECRET` no está en `apps/dashboard/.env.local`
  - El timestamp de la firma expira entre la generación y la recepción (window de 5 min)
  - El proxy no pasa el `tenantId` correctamente en el header HMAC
- **Investigar:**
  - Verificar que `WHATSAPP_SERVICE_HMAC_SECRET` está en `.env.local` y coincide con `.env`
  - Logs del whatsapp-service al recibir la request (¿muestra "HMAC verification failed"?)
  - `apps/dashboard/app/api/whatsapp/[...path]/route.ts` — cómo obtiene el tenantId para firmar

### 3. `/leads?limit=200` devuelve 400

- **Ubicación:** Network tab al abrir tabs de "Enviar Mensaje" o "Mensajes Proactivos" en WhatsApp Manager
- **Síntoma:** `GET http://localhost:3003/leads?limit=200` → 400 Bad Request
- **Impacto:** El dropdown de leads en bulk send/proactive messages no carga. El usuario no puede seleccionar leads para envío masivo.
- **Causa probable:** El DTO de query del `LeadsController.findAll` tiene validación `@Max()` que limita el valor de `limit` (probablemente a 100).
- **Investigar:**
  - `apps/api/src/leads/dto/` — buscar validador de `limit`
  - `apps/dashboard/` — buscar quién hace el fetch con `limit=200` y cambiarlo a un valor válido o paginar

---

## P2 — Medio impacto

### 4. Puppeteer/Chromium abre con DevTools en dev

- **Ubicación:** whatsapp-service al arrancar con `pnpm dev`
- **Síntoma:** Chrome se abre visible con DevTools. Cualquier interacción con la ventana de DevTools (scroll, inspeccionar elementos, refrescar) destruye el JS context de Puppeteer: `Protocol error: Execution context was destroyed`.
- **Impacto:** El siguiente `Client.sendMessage` falla. La sesión WhatsApp se corrompe.
- **Documentado en:** CLAUDE.md sección "Dev local con PUPPETEER_HEADLESS=false"
- **Workaround:** `PUPPETEER_HEADLESS=true pnpm dev` (la env var está en `turbo.json globalEnv`)
- **Fix permanente:** Cambiar default en `.env` a `PUPPETEER_HEADLESS=true`, o añadir un `.env.development` con ese valor.

### 5. Port conflicts con múltiples `pnpm dev`

- **Ubicación:** Al correr `pnpm dev` más de una vez sin matar los procesos anteriores
- **Síntoma:** `Error: listen EADDRINUSE: address already in use 0.0.0.0:3003` — NestJS API no arranca
- **Impacto:** El API queda en un proceso zombie del lanzamiento anterior. El nuevo intento falla silenciosamente (Turbo no muestra el error claramente).
- **Causa:** Turbo dev no mata procesos hijos de ejecuciones anteriores. En Windows, los procesos node persisten.
- **Workaround:** Antes de `pnpm dev`, matar procesos en los puertos:
  ```powershell
  Get-NetTCPConnection -LocalPort 3001,3002,3003 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  ```
- **Fix permanente:** Añadir un script `pnpm dev:clean` que mate procesos antes de arrancar.

### 6. WhatsApp sesiones en dev — crear/eliminar inestable

- **Ubicación:** `/dashboard/whatsapp` → crear sesión nueva
- **Síntoma:** Al crear sesión, Chromium se abre pero el QR no aparece o no es escaneable. Eliminar sesiones no limpia el estado correctamente. Crear múltiples sesiones causa conflictos.
- **Impacto:** WhatsApp no es testeable en dev local sin una sesión previamente autenticada via prod/LocalAuth.
- **Causa:** Puppeteer en dev local sin sesión previa necesita QR scan, pero el browser visible + DevTools interfiere con el flujo.
- **Workaround:** Usar `PUPPETEER_HEADLESS=true` y copiar `.wwebjs_auth` de una sesión ya autenticada.

---

## P3 — Bajo impacto

### 7. Jest worker no cierra limpiamente

- **Ubicación:** `pnpm --filter @leadcrm/whatsapp-service test` → warning al final
- **Síntoma:** `A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown.`
- **Impacto:** Tests pasan pero Jest fuerza el cierre. Podría causar flakiness en CI si empeora.
- **Causa:** Timers o connections (Redis, Prisma, WebSocket) no cerrados en test teardown. Probablemente del singleton `DatabaseService` que inicializa un Pool en el constructor.
- **Fix:** Añadir `afterAll` hooks que cierren connections, o usar `--forceExit` en Jest config (workaround).

### 8. Docs app (port 3004) EADDRINUSE

- **Ubicación:** `apps/docs` al correr `pnpm dev`
- **Síntoma:** `Error: listen EADDRINUSE: address already in use :::3004`
- **Impacto:** Nulo — la app docs es una página estática de enlaces, no se usa en desarrollo activo.
- **Fix:** Matar el proceso en 3004 o cambiar el puerto en `apps/docs/package.json`.

---

## Relación con B2

**Ninguno de estos 8 issues fue causado o empeorado por los cambios de Fase B2.** Todos existen en la rama `develop` sin los commits de B2. Fueron detectados durante el smoke test local de B2 porque es la primera vez que se hace un smoke completo con Chrome MCP + network monitoring + logs en esta sesión.

Los cambios de B2 (19 commits, +2191 líneas) pasaron el smoke sin regresiones:
- Dashboard, Leads, WhatsApp Manager cargan correctamente
- Endpoints B2.7-B2.9 (ai-agents CRUD) responden 200/201
- Tenant isolation verificada (Testing = 0 leads, EscortsHub = 13)
- 115 tests verdes (API 53 + WS 62)
