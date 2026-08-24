/**
 * Consent gate for POST /proactive-messages/bulk.
 *
 * The single-send endpoint rejects leads without `whatsappAuthorized`; the bulk
 * loop used to filter only by tenant, so a batch could message leads that never
 * opted in. That is the highest ban-risk path in the service, hence a
 * regression test rather than trusting the guard to survive future edits.
 *
 * No supertest: the handler is pulled straight off the Express router stack and
 * driven with fake req/res. Couples to Express internals, but costs one file.
 */
import type { Request, Response } from 'express';

// The router binds many controller methods at import time; any function will do.
jest.mock('../controllers/SessionController', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => jest.fn() }),
}));
jest.mock('./health', () => ({ __esModule: true, default: require('express').Router() }));
jest.mock('./redis', () => ({ __esModule: true, default: require('express').Router() }));

jest.mock('../middleware/tenant-guard', () => ({
  __esModule: true,
  requireTenantContext: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireSessionOwnership: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireOperatorRole: (_req: unknown, _res: unknown, next: () => void) => next(),
  assertSessionOwnership: jest.fn().mockResolvedValue(true),
}));

jest.mock('../middleware/validation', () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    __esModule: true,
    validateCreateSession: passthrough,
    validateSendMessage: passthrough,
    validateSessionId: passthrough,
    validateWhatsAppSendMessage: passthrough,
    rateLimit: passthrough,
    rateLimitBySession: passthrough,
  };
});

const findFirst = jest.fn();
const createProactiveMessage = jest.fn();
const updateProactiveMessageStatus = jest.fn();

jest.mock('../services/DatabaseService', () => ({
  __esModule: true,
  default: {
    prisma: { lead: { findFirst: (...args: unknown[]) => findFirst(...args) } },
    createProactiveMessage: (...args: unknown[]) => createProactiveMessage(...args),
    updateProactiveMessageStatus: (...args: unknown[]) => updateProactiveMessageStatus(...args),
    getTemplate: jest.fn(),
    replaceTemplateVariables: (content: string) => content,
  },
}));

const sendMessage = jest.fn();

jest.mock('../services/WhatsAppServiceSimple', () => ({
  __esModule: true,
  default: { sendMessage: (...args: unknown[]) => sendMessage(...args) },
}));

import router from './index';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type Handler = (req: Request, res: Response) => Promise<void>;

function bulkHandler(): Handler {
  const layer = (router as unknown as { stack: any[] }).stack.find(
    l => l.route?.path === '/proactive-messages/bulk'
  );
  if (!layer) throw new Error('POST /proactive-messages/bulk not found on router stack');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function buildReqRes(leadIds: string[]) {
  const req = {
    body: { leadIds, sessionId: 'session-1', content: 'hola' },
    tenantId: TENANT,
  } as unknown as Request;

  const json = jest.fn();
  const res = {
    json,
    status: () => ({ json }),
  } as unknown as Response;

  return { req, res, json };
}

describe('POST /proactive-messages/bulk — consent gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createProactiveMessage.mockResolvedValue('proactive-1');
    updateProactiveMessageStatus.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue({ success: true });
  });

  it.each([
    ['false', false],
    ['null', null],
    ['undefined', undefined],
  ])('does not send to a lead whose whatsappAuthorized is %s', async (_label, authorized) => {
    findFirst.mockResolvedValue({
      id: 'lead-1',
      name: 'Sin consentimiento',
      phone: '34600000001',
      whatsappAuthorized: authorized,
    });

    const { req, res, json } = buildReqRes(['lead-1']);
    await bulkHandler()(req, res);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(createProactiveMessage).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          total: 1,
          successful: 0,
          failed: 1,
          // Pin the reason: without it any other `continue` in the loop
          // (lead not found, a thrown error) would satisfy this test.
          errors: [expect.stringContaining('has not authorized')],
        }),
      })
    );
  });

  it('still sends to an authorized lead', async () => {
    findFirst.mockResolvedValue({
      id: 'lead-2',
      name: 'Con consentimiento',
      phone: '34600000002',
      whatsappAuthorized: true,
    });

    const { req, res, json } = buildReqRes(['lead-2']);
    await bulkHandler()(req, res);

    expect(sendMessage).toHaveBeenCalledWith('session-1', '34600000002', 'hola');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ total: 1, successful: 1, failed: 0 }),
      })
    );
  });
});
