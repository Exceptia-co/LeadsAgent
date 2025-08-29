import { Router } from 'express';
import RedisController from '../controllers/RedisController';

const router = Router();

// ============ RUTAS DE ESTADO Y MONITOREO ============

/**
 * GET /redis/status
 * Obtiene el estado de conexión de Redis
 */
router.get('/status', RedisController.getRedisStatus);

/**
 * GET /redis/stats
 * Obtiene estadísticas del servicio y cache
 */
router.get('/stats', RedisController.getStats);

/**
 * GET /redis/keys
 * Obtiene keys de Redis por patrón
 * Query params: pattern (opcional, default: *)
 */
router.get('/keys', RedisController.getKeys);

// ============ RUTAS DE CACHE ============

/**
 * DELETE /redis/cache/phone/:phone
 * Limpia cache de un teléfono específico
 */
router.delete('/cache/phone/:phone', RedisController.clearPhoneCache);

/**
 * GET /redis/cache/lead/:phone
 * Obtiene información de un lead desde cache
 */
router.get('/cache/lead/:phone', RedisController.getCachedLead);

/**
 * GET /redis/cache/conversations/:phone
 * Obtiene conversaciones desde cache
 * Query params: limit (opcional, default: 10)
 */
router.get('/cache/conversations/:phone', RedisController.getCachedConversations);

// ============ RUTAS DE RATE LIMITING ============

/**
 * GET /redis/rate-limit/:phone
 * Obtiene información del rate limiting para un teléfono
 */
router.get('/rate-limit/:phone', RedisController.getRateLimitInfo);

// ============ RUTAS DE ESTADÍSTICAS ============

/**
 * POST /redis/stats/:metric/increment
 * Incrementa un contador de estadísticas
 * Body: { value?: number } (opcional, default: 1)
 */
router.post('/stats/:metric/increment', RedisController.incrementStat);

// ============ RUTAS DE PRUEBAS ============

/**
 * GET /redis/test/cache
 * Prueba de escritura y lectura de cache
 */
router.get('/test/cache', RedisController.testCache);

/**
 * POST /redis/test/pubsub
 * Prueba de publicación en canal Redis
 * Body: { channel: string, message: any }
 */
router.post('/test/pubsub', RedisController.testPubSub);

export default router;
