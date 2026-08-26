/**
 * Shared constants for WhatsApp session management.
 * Centralizes values that were previously scattered across multiple services.
 */
export const SESSION_CONSTANTS = {
  /** Max reconnect attempts before a session is deactivated */
  MAX_RECONNECT_ATTEMPTS: 3,
  /** Max age for session recovery — sessions older than this are considered stale */
  MAX_RECOVERY_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
  /**
   * Pre-key stock below which a connected session is in trouble.
   *
   * This is Baileys' own `MIN_PREKEY_COUNT`: it counts the server's stock at
   * every open and uploads a fresh batch (`INITIAL_PREKEY_COUNT`, 30) when it
   * falls to this. So a *connected* session sitting below this number means
   * the replenishment did not reach `whatsapp_auth_keys` — the alarm, not the
   * normal low-water mark.
   *
   * Kept as our own constant rather than imported: Baileys does not export it
   * from the package root, and a threshold that moves under us on a minor
   * bump is not what we want guarding an alert.
   */
  MIN_PRE_KEY_COUNT: 5,
} as const;
