/**
 * Fase A9 (2026-04-19): test de la primitive de dedupe (`setNX`).
 *
 * Testeamos el comportamiento a nivel del método de RedisClient, no del
 * handler completo en EventDispatcher. El handler es demasiado complejo de
 * mockear (whatsapp-web.js, Puppeteer, DB, webhooks); probar la primitive
 * garantiza que el bloque atómico sobre el que se apoya el dedupe funciona.
 *
 * Casos cubiertos:
 * 1. Primer SET — clave nueva → Redis responde 'OK' → setNX retorna true
 * 2. Segundo SET sobre la misma clave → Redis responde null → setNX retorna false
 * 3. Error transitorio de Redis → setNX retorna true (fail-open real)
 */

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  },
}));

// Mock de ioredis con control programable por test
const mockSet = jest.fn();
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    set: mockSet,
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    status: 'ready',
  }));
});

// Import después de los mocks para que los aplique
import { redisClient } from './redis';

describe('RedisClient.setNX (Fase A1 — dedupe primitive)', () => {
  beforeEach(() => {
    mockSet.mockReset();
  });

  it('retorna true cuando Redis crea la clave (primera vez)', async () => {
    mockSet.mockResolvedValueOnce('OK');

    const result = await redisClient.setNX('test:key:1', '1', 300);

    expect(result).toBe(true);
    expect(mockSet).toHaveBeenCalledWith('test:key:1', '1', 'EX', 300, 'NX');
  });

  it('retorna false cuando la clave ya existía (segunda vez sobre misma key)', async () => {
    mockSet.mockResolvedValueOnce(null);

    const result = await redisClient.setNX('test:key:2', '1', 300);

    expect(result).toBe(false);
    expect(mockSet).toHaveBeenCalledWith('test:key:2', '1', 'EX', 300, 'NX');
  });

  it('retorna true (fail-open) cuando Redis lanza error', async () => {
    mockSet.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await redisClient.setNX('test:key:3', '1', 300);

    // Preferimos doble respuesta rara antes que silencio total si Redis cae.
    expect(result).toBe(true);
  });

  it('secuencia típica de dedupe: primera true, segunda false', async () => {
    mockSet.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    const first = await redisClient.setNX('test:dedup:msg-abc', '1', 300);
    const second = await redisClient.setNX('test:dedup:msg-abc', '1', 300);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(mockSet).toHaveBeenCalledTimes(2);
  });
});
