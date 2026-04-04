/**
 * Shared constants for WhatsApp session management.
 * Centralizes values that were previously scattered across multiple services.
 */
export const SESSION_CONSTANTS = {
  /** Max reconnect attempts before a session is deactivated */
  MAX_RECONNECT_ATTEMPTS: 3,
  /** Max age for session recovery — sessions older than this are considered stale */
  MAX_RECOVERY_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
  /** Max compressed snapshot size allowed to be stored in the database */
  MAX_SNAPSHOT_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
} as const;
