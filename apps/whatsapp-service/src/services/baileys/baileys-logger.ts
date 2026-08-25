import { logger } from '../../utils/logger';
// ILogger is defined in Utils/logger.d.ts but Utils/index.d.ts never
// re-exports that file, so it does not reach the package's public root
// entrypoint -- a packaging gap in @whiskeysockets/baileys@6.7.24, not a
// resolution issue. Importing the subpath directly is the only way to name
// the type; the frozen `makeBaileysLogger(...): ILogger` signature is
// unaffected either way.
import type { ILogger } from '@whiskeysockets/baileys/lib/Utils/logger';

/**
 * Baileys' ILogger over this repo's winston logger.
 *
 * Two incompatibilities, not one: ILogger needs `level`, `child` and `trace`,
 * and its methods take (obj, msg) where ours take (message, meta). Casting
 * instead of adapting would compile and then log every Baileys line with the
 * object where the message should be.
 */
export function makeBaileysLogger(bindings: Record<string, unknown> = {}): ILogger {
  const prefix = Object.entries(bindings)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' ');
  const line = (obj: unknown, msg?: string): [string, unknown] => {
    // Baileys calls both log(obj, msg) and log(msg). Normalize to our shape.
    const text = msg ?? (typeof obj === 'string' ? obj : '');
    const meta = msg === undefined && typeof obj === 'string' ? undefined : obj;
    return [prefix ? `[baileys ${prefix}] ${text}` : `[baileys] ${text}`, meta];
  };

  return {
    level: process.env.LOG_LEVEL || 'info',
    child: (obj: Record<string, unknown>) => makeBaileysLogger({ ...bindings, ...obj }),
    // Baileys' trace is extremely chatty (every binary node). Map it to debug
    // so LOG_LEVEL still governs it and it never reaches production logs.
    trace: (obj, msg) => logger.debug(...(line(obj, msg) as [string, any])),
    debug: (obj, msg) => logger.debug(...(line(obj, msg) as [string, any])),
    info: (obj, msg) => logger.info(...(line(obj, msg) as [string, any])),
    warn: (obj, msg) => logger.warn(...(line(obj, msg) as [string, any])),
    error: (obj, msg) => logger.error(...(line(obj, msg) as [string, any])),
  };
}
