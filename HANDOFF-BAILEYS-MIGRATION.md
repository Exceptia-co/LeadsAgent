# Handoff: migración `whatsapp-web.js` → Baileys

**Estado: acordada, no iniciada.** Decidida el 2026-08-25 tras evaluar el ecosistema
y contrastar tres puntos de vista (Claude + Codex + los datos del propio repo).

Este fichero es el punto de entrada para quien retome el trabajo. Vive en la raíz del
repo; bórralo cuando el cutover esté hecho.

---

## Por qué se migra

El techo actual es **~5–8 sesiones concurrentes** en el CX23 (2 vCPU / 4 GB), y es un
techo de **Chromium**, no del producto: 300–400 MB por sesión. Baileys usa 30–80 MB.
Mismo hierro, ~40–60 sesiones. Sin eso, cada tenant nuevo es hierro nuevo.

Ver `PLAN-WHATSAPP-AGENT-MULTITENANT.md:37` (techo) y `:73` (memory leaks documentados).

## Por qué ahora y no después

El proyecto está en piloto, sin clientes de pago. El propio plan lo dice en la línea 53:

> «Lectura: proyecto en fase piloto. Ventana ideal para cambios arquitectónicos sin
> migración dolorosa.»

Migrar cambia el formato del estado de sesión, así que **cada cliente tendrá que
reescanear el QR**. Hoy eso lo haces tú. Con 50 clientes es una llamada a cada uno.

## Por qué motor único y no adapter dual

Se descartó un flag `WA_ENGINE=wwebjs|baileys`. Con wwebjs condenado, mantener dos
motores es duplicar lifecycle, eventos, auth, diagnósticos y tests para una
implementación destinada a morir. Para poder volver atrás ya existe `git`.

Para el canario: rama y despliegue aparte con **una** sesión y un **número
desechable** — no el tuyo ni el de un piloto.

## Por qué no Meta Cloud API

Incompatible con el onboarding: el cliente conecta **su propio número** por QR, el que
ya usa con sus contactos. Cloud API exige número dedicado. _Coexistence_ existe pero
solo cubre WhatsApp **Business App**, no personal. Ver R1 en el plan.

## Por qué no OpenWA ni WAHA

- **WAHA**: el multi-sesión en un solo contenedor, que es justo lo que necesitas, es de pago.
- **OpenWA**: es un gateway que envuelve wwebjs/baileys, no una librería. Adoptarlo mete
  un tercero en la ruta crítica del aislamiento multi-tenant que costó toda la fase B, y
  su propia documentación reconoce que es single-instance sin escalado horizontal. Ahorra
  1–2 semanas, no 3–5. **Sí sirve como referencia de código** (es MIT, mismo stack):
  `src/engine/identity/wa-id.ts`, `src/engine/adapters/baileys-session-store.ts`,
  `baileys-message-mapper.ts` y `baileys-lifecycle.ts`. No copiar su auth: usa
  `useMultiFileAuthState`, desaconsejado en producción.

---

## Antes de empezar

- [ ] **No implementar C7 ni C8** del plan. Son workarounds de Chromium, trabajo tirado.
      Ya marcados como superseded.
- [ ] **No tocar `HANDOFF-BUMP-WAWEB.md`.** Cerrado como WONTFIX.
- [ ] **Fijar `@whiskeysockets/baileys@6.7.x`**, no la 7.x — sigue en release candidate.
- [ ] **Tests de caracterización primero.** El flujo mensaje → IA → respuesta no tiene
      tests directos y es el que más se va a mover. Escríbelos contra **tu propia
      interfaz** (`IWhatsAppSessionManager`, tus DTOs), **no** contra `Message` de wwebjs
      — si no, se tiran con la librería. 3–5 casos: entrada→dedupe→tenant→respuesta,
      QR/ready, desconexión, envío.
- [ ] **Migrar antes que escribir los E2E de B3.3.** Escribirlos contra el motor saliente
      es trabajo doble.

## Alcance real

**Reescribir:** `ConnectionManager`, `EventDispatcher`, `AuthenticationManager`, la capa
de transporte de `MessageHandler`, y `services/auth-snapshot/SnapshotService.ts` (hoy un
tar cifrado del perfil de Chromium → pasa a JSON en Postgres, mucho más simple).

**Adaptar:** `WhatsAppServiceSimple`, `SessionManager`, `SessionRecoveryService`, tipos,
Dockerfile.

**Borrar:** `config/puppeteer.config.ts` (119 líneas), `scripts/cleanup-chrome.ps1`,
`patches/`, deps `puppeteer` y `tar`, el `chromium` del Dockerfile.

**Se reutiliza sin tocar:** DB, IA, Redis, contratos REST y Socket.IO.

**Estimación:** 3–5 semanas-persona más el reemparejado.

## Trampas conocidas

1. **No usar `useMultiFileAuthState` en producción.** Persistencia durable de
   credenciales y claves Signal en DB.
2. **Normalizar `WAMessage` a un DTO interno de inmediato.** Que LID, `remoteJid` ni
   protobufs lleguen a la capa de IA o a la DB.
3. **Definir el dedupe antes de migrar.** `EventDispatcher:322` depende de
   `id._serialized`; con LID los identificadores cambian.
4. **`message.body` no existe en Baileys.** El texto vive en `conversation`,
   `extendedTextMessage.text`, `imageMessage.caption`… Una función que no cubra un tipo
   nuevo devuelve vacío en silencio.
5. **Los 9 eventos se vuelven uno.** `connection.update` con códigos numéricos
   (`DisconnectReason`). La lógica de «¿fallo real o reconexión normal?» pasa a ser tuya.
6. **Conservar los contratos REST, Socket.IO y los estados de sesión.** Cambias el
   transporte, no el dashboard ni la base de datos. Esto es lo que impide que «migrar la
   librería» se convierta en «reescribir el producto».

## Lo que NO mejora con la migración

- **El riesgo de baneo.** Es por comportamiento, no por librería. De hecho el
  fingerprint de Baileys es sintético, así que el riesgo _técnico_ puede ser algo mayor
  — y el número en juego es el personal del cliente. De ahí el canario con número
  desechable.
- **La resistencia a cambios de WhatsApp.** wwebjs usa Chrome real y se adapta solo;
  Baileys imita el protocolo y se rompe hasta que publiquen parche.

Ambos riesgos deben quedar escritos en el plan antes del cutover, no como nota al pie.

---

## Contexto previo imprescindible

- `PLAN-WHATSAPP-AGENT-MULTITENANT.md` — cabecera (decisión), Fase C (C7/C8 superseded),
  R1 (Cloud API condicionado), registro v7.11
- `PREEXISTING-ISSUES.md` § _Pendientes descubiertos en PR #12_
- PR #12 — el trabajo de consentimiento que precede a esto y que **no** depende del motor
