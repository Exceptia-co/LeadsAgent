/**
 * PR5a-quater + PR5a-quinquies: unit tests for tenant-guard middlewares.
 * Covers requireTenantContext, requireOperatorRole and assertSessionOwnership
 * via SessionPersistenceService mock.
 */
import type { NextFunction, Request, Response } from 'express';

jest.mock('../services/SessionPersistenceService', () => ({
  __esModule: true,
  default: {
    getSessionTenantId: jest.fn(),
  },
}));

import SessionPersistenceService from '../services/SessionPersistenceService';
import {
  assertSessionOwnership,
  requireOperatorRole,
  requireSessionOwnership,
  requireTenantContext,
} from './tenant-guard';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OPERATOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildReqRes(overrides: Partial<Request & { tenantId?: string }> = {}) {
  const req = {
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;

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

describe('requireTenantContext', () => {
  it('passes when req.tenantId is present', () => {
    const { req, res, next, statusSpy } = buildReqRes({ tenantId: TENANT_A });
    requireTenantContext(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('returns 403 when req.tenantId is missing', () => {
    const { req, res, next, statusSpy } = buildReqRes();
    requireTenantContext(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(403);
  });
});

describe('requireOperatorRole', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv } as NodeJS.ProcessEnv;
  });

  it('returns 403 when WHATSAPP_OPERATOR_HMAC_TENANT_ID is unset', () => {
    delete process.env.WHATSAPP_OPERATOR_HMAC_TENANT_ID;
    const { req, res, next, statusSpy, jsonSpy } = buildReqRes({
      tenantId: TENANT_A,
    });
    requireOperatorRole(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(403);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('operator role not configured'),
      })
    );
  });

  it('returns 403 when caller tenant differs from operator tenant', () => {
    process.env.WHATSAPP_OPERATOR_HMAC_TENANT_ID = OPERATOR;
    const { req, res, next, statusSpy } = buildReqRes({ tenantId: TENANT_A });
    requireOperatorRole(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(403);
  });

  it('passes when caller tenant matches the operator tenant', () => {
    process.env.WHATSAPP_OPERATOR_HMAC_TENANT_ID = OPERATOR;
    const { req, res, next, statusSpy } = buildReqRes({ tenantId: OPERATOR });
    requireOperatorRole(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
  });
});

describe('assertSessionOwnership / requireSessionOwnership', () => {
  const getSessionTenantIdMock = SessionPersistenceService.getSessionTenantId as jest.Mock;

  beforeEach(() => {
    getSessionTenantIdMock.mockReset();
  });

  it('assertSessionOwnership returns true when tenant owns session', async () => {
    getSessionTenantIdMock.mockResolvedValue(TENANT_A);
    const ok = await assertSessionOwnership('s1', TENANT_A);
    expect(ok).toBe(true);
  });

  it('assertSessionOwnership returns false on cross-tenant', async () => {
    getSessionTenantIdMock.mockResolvedValue(TENANT_A);
    const ok = await assertSessionOwnership('s1', TENANT_B);
    expect(ok).toBe(false);
  });

  it('assertSessionOwnership returns false when session does not exist', async () => {
    getSessionTenantIdMock.mockResolvedValue(null);
    const ok = await assertSessionOwnership('missing', TENANT_A);
    expect(ok).toBe(false);
  });

  it('requireSessionOwnership returns 404 on cross-tenant', async () => {
    getSessionTenantIdMock.mockResolvedValue(TENANT_A);
    const { req, res, next, statusSpy } = buildReqRes({
      tenantId: TENANT_B,
      params: { sessionId: 's-of-A' } as unknown as Request['params'],
    });
    await requireSessionOwnership(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(404);
  });

  it('requireSessionOwnership returns 404 when session not found', async () => {
    getSessionTenantIdMock.mockResolvedValue(null);
    const { req, res, next, statusSpy } = buildReqRes({
      tenantId: TENANT_A,
      params: { sessionId: 'ghost' } as unknown as Request['params'],
    });
    await requireSessionOwnership(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(404);
  });

  it('requireSessionOwnership returns 403 when tenant context missing', async () => {
    const { req, res, next, statusSpy } = buildReqRes({
      params: { sessionId: 's1' } as unknown as Request['params'],
    });
    await requireSessionOwnership(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(403);
  });

  it('requireSessionOwnership returns 400 when sessionId missing on body+params', async () => {
    const { req, res, next, statusSpy } = buildReqRes({ tenantId: TENANT_A });
    await requireSessionOwnership(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusSpy).toHaveBeenCalledWith(400);
  });

  it('requireSessionOwnership passes when ownership matches', async () => {
    getSessionTenantIdMock.mockResolvedValue(TENANT_A);
    const { req, res, next, statusSpy } = buildReqRes({
      tenantId: TENANT_A,
      params: { sessionId: 's-of-A' } as unknown as Request['params'],
    });
    await requireSessionOwnership(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
  });
});
