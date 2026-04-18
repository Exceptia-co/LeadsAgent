"use client";

import { useMemo } from "react";

/**
 * T0.4-ter: tras activar HMAC en el whatsapp-service, todas las llamadas HTTP
 * desde el dashboard deben pasar por el proxy `/api/whatsapp/*`, que firma
 * el request antes de reenviarlo al servicio. Por eso `getWhatsAppUrl` ahora
 * devuelve siempre el path del proxy (`/api/whatsapp`) — incluso en
 * desarrollo. El proxy (`app/api/whatsapp/[...path]/route.ts`) se encarga de
 * resolver la URL real del servicio y de añadir los headers HMAC.
 *
 * Para Socket.IO (WebSocket, no HTTP) usar `getWhatsAppSocketUrl`, porque
 * el proxy Next no proxea WebSocket y la conexión va directa al servicio.
 */

const WHATSAPP_PROXY_PATH = "/api/whatsapp";

function resolveDirectServiceUrl(): string {
  const explicitWs = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  if (explicitWs) return explicitWs;
  const explicit = process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL;
  if (explicit) return explicit;
  return "http://localhost:3002";
}

export function useWhatsAppUrl(): string {
  return useMemo(() => WHATSAPP_PROXY_PATH, []);
}

export function getWhatsAppUrl(): string {
  return WHATSAPP_PROXY_PATH;
}

/**
 * Direct URL to the whatsapp-service host (no proxy). Use only for
 * WebSocket connections (Socket.IO) — HTTP requests must go through the
 * HMAC-signing proxy via `getWhatsAppUrl`.
 */
export function getWhatsAppSocketUrl(): string {
  return resolveDirectServiceUrl();
}
