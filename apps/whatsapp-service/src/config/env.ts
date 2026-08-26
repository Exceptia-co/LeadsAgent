import { z } from 'zod';
import { logger } from '../utils/logger';

/**
 * T0.4-quater (Fase A5, 2026-04-19): validación centralizada de envs al bootstrap.
 * Fail-fast en producción si faltan las críticas; warnings en dev.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Auth server-to-server (HMAC). Mínimo 32 chars; recomendado 64 hex.
  WHATSAPP_SERVICE_HMAC_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters (64 hex recommended)')
    .optional(),

  // Cifrado en reposo de las credenciales de sesión (whatsapp_auth_keys / Task 4)
  WHATSAPP_AUTH_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'WHATSAPP_AUTH_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
    .optional(),

  // Persistencia
  DATABASE_URL: z.string().url().optional(),

  // Redis: acepta REDIS_URL completo o par host/port
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().positive().optional(),
  REDIS_PASSWORD: z.string().optional(),

  // Puertos
  WHATSAPP_SERVICE_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().optional(),

  // Consentimiento proactivo: cuántos días vale un mensaje entrante como
  // prueba de conversación viva. Ver hasLiveInboundConversation en routes/index.ts.
  PROACTIVE_INBOUND_WINDOW_DAYS: z.coerce.number().int().positive().optional(),

  // Otros
  CORS_ORIGIN: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  WEBHOOK_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida `process.env` contra el schema. En producción, fail-fast si hay errores
 * de shape o faltan envs críticos. En dev, warn y continúa (el dev verá el error
 * en cuanto intente usar la feature afectada).
 */
export function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    logger.error('❌ Environment schema validation failed:');
    for (const issue of parsed.error.issues) {
      logger.error(`  • ${issue.path.join('.')}: ${issue.message}`);
    }
    if (process.env.NODE_ENV === 'production') {
      logger.error('🛑 Exiting because NODE_ENV=production and envs are invalid.');
      process.exit(1);
    }
    logger.warn('⚠️  Continuing in non-production mode despite env errors');
  }

  const env = parsed.success ? parsed.data : (process.env as unknown as Env);

  // Validaciones semánticas cruzadas (no expresables en Zod schema puro)
  const isTest = env.NODE_ENV === 'test';
  const isProd = env.NODE_ENV === 'production';

  if (!isTest) {
    if (!env.WHATSAPP_SERVICE_HMAC_SECRET) {
      const msg =
        'WHATSAPP_SERVICE_HMAC_SECRET is required outside test — HMAC-protected endpoints will reject all requests';
      if (isProd) {
        logger.error(`❌ ${msg}`);
        logger.error('🛑 Exiting because NODE_ENV=production and HMAC secret is missing.');
        process.exit(1);
      }
      logger.warn(`⚠️  ${msg} (dev mode: continuing)`);
    }

    if (!env.WHATSAPP_AUTH_ENCRYPTION_KEY) {
      const msg =
        'WHATSAPP_AUTH_ENCRYPTION_KEY is required outside test — session credentials cannot be sealed or opened without it';
      if (isProd) {
        logger.error(`❌ ${msg}`);
        logger.error(
          '🛑 Exiting because NODE_ENV=production and the credential encryption key is missing.'
        );
        process.exit(1);
      }
      logger.warn(`⚠️  ${msg} (dev mode: continuing)`);
    }

    if (!env.DATABASE_URL) {
      logger.warn('⚠️  DATABASE_URL not set — running without persistence');
    }

    if (!env.REDIS_URL && !env.REDIS_HOST) {
      logger.warn(
        '⚠️  Neither REDIS_URL nor REDIS_HOST set — dedupe/cache/session-locks will degrade'
      );
    }
  }

  logger.info(`✅ Environment validated (NODE_ENV=${env.NODE_ENV})`);
  return env;
}
