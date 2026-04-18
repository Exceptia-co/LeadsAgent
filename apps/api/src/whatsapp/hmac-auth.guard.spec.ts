import {
  ExecutionContext,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { HmacAuthGuard } from './hmac-auth.guard';

const SECRET = 'a'.repeat(64);

function makeContext(
  headers: Record<string, string | undefined>,
  rawBody?: Buffer,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => headers[name.toLowerCase()],
        rawBody,
      }),
    }),
  } as unknown as ExecutionContext;
}

function sign(body: string, ts: number): string {
  const hex = createHmac('sha256', SECRET)
    .update(`${ts}.${body}`)
    .digest('hex');
  return `sha256=${hex}`;
}

describe('HmacAuthGuard', () => {
  const originalEnv = process.env;
  let guard: HmacAuthGuard;

  beforeEach(() => {
    guard = new HmacAuthGuard();
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    process.env.WHATSAPP_SERVICE_HMAC_SECRET = SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('bypasses verification in NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it('throws InternalServerErrorException when the secret is missing', () => {
    delete process.env.WHATSAPP_SERVICE_HMAC_SECRET;
    expect(() => guard.canActivate(makeContext({}))).toThrow(
      InternalServerErrorException,
    );
  });

  it('rejects when headers are missing', () => {
    expect(() => guard.canActivate(makeContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the timestamp is outside the 5-minute window', () => {
    const body = '{"event":"message"}';
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const ctx = makeContext(
      {
        'x-service-timestamp': String(tenMinAgo),
        'x-service-signature': sign(body, tenMinAgo),
      },
      Buffer.from(body),
    );
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects when the body has been tampered with', () => {
    const body = '{"event":"message"}';
    const tampered = '{"event":"hacked"}';
    const ts = Date.now();
    const ctx = makeContext(
      {
        'x-service-timestamp': String(ts),
        'x-service-signature': sign(body, ts),
      },
      Buffer.from(tampered),
    );
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('accepts a fresh, correctly-signed request', () => {
    const body = '{"event":"message","sessionId":"s1"}';
    const ts = Date.now();
    const ctx = makeContext(
      {
        'x-service-timestamp': String(ts),
        'x-service-signature': sign(body, ts),
      },
      Buffer.from(body),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
