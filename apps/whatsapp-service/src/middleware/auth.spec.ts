/**
 * T0.4-ter: unit tests for the HMAC signature round-trip (sign/verify).
 * Ensures the helper used by the dashboard and API Nest stays in lock-step
 * with the verifier running inside whatsapp-service.
 *
 * Uso: pnpm --filter @leadcrm/whatsapp-service exec jest src/middleware/auth.spec.ts
 */
import type { NextFunction, Request, Response } from 'express';
import { signServiceRequest, verifyServiceSignature } from './auth';

const SECRET = 'a'.repeat(64);

function buildReqRes(options: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  rawBody?: string;
}) {
  const { method = 'POST', path = '/api/proactive-messages', headers = {}, rawBody = '' } = options;
  const normalisedHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const req = {
    method,
    path,
    header(name: string) {
      return normalisedHeaders[name.toLowerCase()];
    },
    rawBody: Buffer.from(rawBody),
  } as unknown as Request & { rawBody: Buffer };

  const status = jest.fn();
  const json = jest.fn();
  const res = {
    status: (code: number) => {
      status(code);
      return { json };
    },
  } as unknown as Response;

  const next: NextFunction = jest.fn();
  return { req, res, next, statusSpy: status, jsonSpy: json };
}

describe('verifyServiceSignature', () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_SERVICE_HMAC_SECRET = SECRET;
  });

  afterAll(() => {
    process.env = previousEnv as NodeJS.ProcessEnv;
  });

  it('lets requests through when the signature is valid', () => {
    const body = JSON.stringify({ hello: 'world' });
    const { timestamp: ts, signature: sig } = signServiceRequest(body, SECRET);
    const { req, res, next, statusSpy } = buildReqRes({
      headers: { 'x-service-timestamp': ts, 'x-service-signature': sig },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the signature headers are missing', () => {
    const { req, res, next, statusSpy } = buildReqRes({
      rawBody: JSON.stringify({ hello: 'world' }),
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the body has been tampered with', () => {
    const originalBody = JSON.stringify({ hello: 'world' });
    const tamperedBody = JSON.stringify({ hello: 'mundo' });
    const { timestamp: ts, signature: sig } = signServiceRequest(originalBody, SECRET);
    const { req, res, next, statusSpy } = buildReqRes({
      headers: { 'x-service-timestamp': ts, 'x-service-signature': sig },
      rawBody: tamperedBody,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the timestamp is older than 5 minutes', () => {
    const body = JSON.stringify({ hello: 'world' });
    const ts = (Date.now() - 6 * 60 * 1000).toString();
    // Hand-crafted signature using the stale timestamp so we exercise the
    // age check, not the HMAC mismatch path.
    const hex = require('node:crypto')
      .createHmac('sha256', SECRET)
      .update(`${ts}.${body}`)
      .digest('hex');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': ts,
        'x-service-signature': `sha256=${hex}`,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('allows public health paths without a signature', () => {
    const { req, res, next, statusSpy } = buildReqRes({
      method: 'GET',
      path: '/api/health',
    });

    verifyServiceSignature(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('returns 500 when the HMAC secret is not configured', () => {
    delete process.env.WHATSAPP_SERVICE_HMAC_SECRET;
    const body = JSON.stringify({ hello: 'world' });
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': Date.now().toString(),
        'x-service-signature': 'sha256=deadbeef',
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(500);
  });

  // ─── Fase A8 (2026-04-19): edge cases añadidos en esta fase ───

  it('lets GET requests with empty body through when signed correctly', () => {
    // Requests GET/DELETE no tienen body. Auth capture en main.ts setea
    // `rawBody = Buffer.from('')`. La firma se calcula sobre string vacío.
    const body = '';
    const { timestamp: ts, signature: sig } = signServiceRequest(body, SECRET);
    const { req, res, next, statusSpy } = buildReqRes({
      method: 'GET',
      path: '/api/sessions',
      headers: { 'x-service-timestamp': ts, 'x-service-signature': sig },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the signature lacks the sha256= prefix', () => {
    const body = JSON.stringify({ hello: 'world' });
    const { timestamp: ts, signature: sig } = signServiceRequest(body, SECRET);
    const sigWithoutPrefix = sig.replace(/^sha256=/, '');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: { 'x-service-timestamp': ts, 'x-service-signature': sigWithoutPrefix },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the signature uses a different algorithm prefix', () => {
    const body = JSON.stringify({ hello: 'world' });
    const { timestamp: ts, signature: sig } = signServiceRequest(body, SECRET);
    const wrongAlgo = sig.replace(/^sha256=/, 'md5=');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: { 'x-service-timestamp': ts, 'x-service-signature': wrongAlgo },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the timestamp is not a valid number', () => {
    const body = JSON.stringify({ hello: 'world' });
    const { signature: sig } = signServiceRequest(body, SECRET);
    const { req, res, next, statusSpy } = buildReqRes({
      headers: { 'x-service-timestamp': 'not-a-number', 'x-service-signature': sig },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the timestamp is in the future beyond the window', () => {
    // El check usa Math.abs(Date.now() - ts), así que timestamps muy futuros
    // también deben rechazarse (protege contra replay adelantado si un cliente
    // tiene reloj corrido).
    const body = JSON.stringify({ hello: 'world' });
    const futureTs = (Date.now() + 6 * 60 * 1000).toString();
    const hex = require('node:crypto')
      .createHmac('sha256', SECRET)
      .update(`${futureTs}.${body}`)
      .digest('hex');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': futureTs,
        'x-service-signature': `sha256=${hex}`,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });
});
