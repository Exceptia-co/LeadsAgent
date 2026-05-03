/**
 * T0.4-ter + PR5a-bis: unit tests for the HMAC signature round-trip
 * (sign/verify) with tenantId binding.
 *
 * Format under test:
 *   payload = `${timestamp}.${tenantId}.${rawBody}`
 *   header  x-service-timestamp / x-service-tenant-id / x-service-signature
 */
import type { NextFunction, Request, Response } from 'express';
import { signServiceRequest, verifyServiceSignature } from './auth';

const SECRET = 'a'.repeat(64);
const TENANT_VALID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

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

  it('lets requests through when signature + tenantId header are valid', () => {
    const body = JSON.stringify({ hello: 'world' });
    const {
      timestamp: ts,
      signature: sig,
      tenantId,
    } = signServiceRequest(body, SECRET, TENANT_VALID);
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': ts,
        'x-service-tenant-id': tenantId,
        'x-service-signature': sig,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
    // PR5a-bis: req.tenantId must be hydrated for downstream handlers.
    expect((req as Request & { tenantId?: string }).tenantId).toBe(TENANT_VALID);
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
    const {
      timestamp: ts,
      signature: sig,
      tenantId,
    } = signServiceRequest(originalBody, SECRET, TENANT_VALID);
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': ts,
        'x-service-tenant-id': tenantId,
        'x-service-signature': sig,
      },
      rawBody: tamperedBody,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  // PR5a-bis: critical case — MITM swaps tenant header but body+signature
  // were signed for a different tenant. Receiver must reject.
  it('rejects with 401 when the tenant header has been swapped', () => {
    const body = JSON.stringify({ hello: 'world' });
    const ATTACKER_TENANT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const { timestamp: ts, signature: sig } = signServiceRequest(body, SECRET, TENANT_VALID);
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': ts,
        'x-service-tenant-id': ATTACKER_TENANT, // swapped post-signing
        'x-service-signature': sig,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  // PR5a-bis: the tenant header is required on tenant-scoped paths even
  // when the signature is otherwise valid. An empty tenantId would mean
  // the caller has no authoritative org context.
  it('rejects with 403 when tenantId is missing on a tenant-scoped path', () => {
    const body = JSON.stringify({ hello: 'world' });
    const { timestamp: ts, signature: sig } = signServiceRequest(body, SECRET, '');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': ts,
        'x-service-tenant-id': '',
        'x-service-signature': sig,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(403);
  });

  it('rejects with 403 when tenantId is not a valid UUID', () => {
    const body = JSON.stringify({ hello: 'world' });
    const { timestamp: ts, signature: sig } = signServiceRequest(body, SECRET, 'not-a-uuid');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': ts,
        'x-service-tenant-id': 'not-a-uuid',
        'x-service-signature': sig,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(403);
  });

  it('rejects with 401 when the timestamp is older than 5 minutes', () => {
    const body = JSON.stringify({ hello: 'world' });
    const ts = (Date.now() - 6 * 60 * 1000).toString();
    const hex = require('node:crypto')
      .createHmac('sha256', SECRET)
      .update(`${ts}.${TENANT_VALID}.${body}`)
      .digest('hex');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': ts,
        'x-service-tenant-id': TENANT_VALID,
        'x-service-signature': `sha256=${hex}`,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('allows public health paths without a signature or tenantId', () => {
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
        'x-service-tenant-id': TENANT_VALID,
        'x-service-signature': 'sha256=deadbeef',
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(500);
  });

  it('lets GET requests with empty body through when signed correctly', () => {
    const body = '';
    const {
      timestamp: ts,
      signature: sig,
      tenantId,
    } = signServiceRequest(body, SECRET, TENANT_VALID);
    const { req, res, next, statusSpy } = buildReqRes({
      method: 'GET',
      path: '/api/sessions',
      headers: {
        'x-service-timestamp': ts,
        'x-service-tenant-id': tenantId,
        'x-service-signature': sig,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the signature lacks the sha256= prefix', () => {
    const body = JSON.stringify({ hello: 'world' });
    const {
      timestamp: ts,
      signature: sig,
      tenantId,
    } = signServiceRequest(body, SECRET, TENANT_VALID);
    const sigWithoutPrefix = sig.replace(/^sha256=/, '');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': ts,
        'x-service-tenant-id': tenantId,
        'x-service-signature': sigWithoutPrefix,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the signature uses a different algorithm prefix', () => {
    const body = JSON.stringify({ hello: 'world' });
    const {
      timestamp: ts,
      signature: sig,
      tenantId,
    } = signServiceRequest(body, SECRET, TENANT_VALID);
    const wrongAlgo = sig.replace(/^sha256=/, 'md5=');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': ts,
        'x-service-tenant-id': tenantId,
        'x-service-signature': wrongAlgo,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the timestamp is not a valid number', () => {
    const body = JSON.stringify({ hello: 'world' });
    const { signature: sig, tenantId } = signServiceRequest(body, SECRET, TENANT_VALID);
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': 'not-a-number',
        'x-service-tenant-id': tenantId,
        'x-service-signature': sig,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the timestamp is in the future beyond the window', () => {
    const body = JSON.stringify({ hello: 'world' });
    const futureTs = (Date.now() + 6 * 60 * 1000).toString();
    const hex = require('node:crypto')
      .createHmac('sha256', SECRET)
      .update(`${futureTs}.${TENANT_VALID}.${body}`)
      .digest('hex');
    const { req, res, next, statusSpy } = buildReqRes({
      headers: {
        'x-service-timestamp': futureTs,
        'x-service-tenant-id': TENANT_VALID,
        'x-service-signature': `sha256=${hex}`,
      },
      rawBody: body,
    });

    verifyServiceSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(401);
  });
});
