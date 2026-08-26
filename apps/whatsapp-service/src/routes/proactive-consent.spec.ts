/**
 * Consent gates for the proactive-messaging endpoints (single + bulk).
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
const messageFindFirst = jest.fn();
const createProactiveMessage = jest.fn();
const updateProactiveMessageStatus = jest.fn();

jest.mock('../services/DatabaseService', () => ({
  __esModule: true,
  default: {
    prisma: {
      lead: { findFirst: (...args: unknown[]) => findFirst(...args) },
      message: { findFirst: (...args: unknown[]) => messageFindFirst(...args) },
    },
    createProactiveMessage: (...args: unknown[]) => createProactiveMessage(...args),
    updateProactiveMessageStatus: (...args: unknown[]) => updateProactiveMessageStatus(...args),
    getTemplate: jest.fn(),
    replaceTemplateVariables: (content: string) => content,
  },
}));

const sendMessage = jest.fn();

jest.mock('../services/WhatsAppService', () => ({
  __esModule: true,
  default: { sendMessage: (...args: unknown[]) => sendMessage(...args) },
}));

import router from './index';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type Handler = (req: Request, res: Response) => Promise<void>;

function handlerFor(path: string): Handler {
  const layer = (router as unknown as { stack: any[] }).stack.find(
    l => l.route?.path === path && l.route?.methods?.post
  );
  if (!layer) throw new Error(`POST ${path} not found on router stack`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const bulkHandler = () => handlerFor('/proactive-messages/bulk');
const singleHandler = () => handlerFor('/proactive-messages');

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
    // Default: the lead wrote to us recently. Cases that need the opposite
    // override it explicitly.
    messageFindFirst.mockResolvedValue({ id: 'inbound-1' });
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

  it('still sends to an authorized lead with a live conversation', async () => {
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

  it('does not send when the inbound landed on another session', async () => {
    findFirst.mockResolvedValue({
      id: 'lead-5',
      name: 'Otra línea',
      phone: '34600000005',
      whatsappAuthorized: true,
    });
    // Stand in for the DB: the inbound exists, but it arrived on session-2.
    messageFindFirst.mockImplementation((args: any) =>
      Promise.resolve(args?.where?.sessionId === 'session-2' ? { id: 'inbound-2' } : null)
    );

    const { req, res, json } = buildReqRes(['lead-5']);
    await bulkHandler()(req, res);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failed: 1,
          errors: [expect.stringContaining('no inbound message')],
        }),
      })
    );
  });

  it('does not send to an authorized lead whose conversation went cold', async () => {
    findFirst.mockResolvedValue({
      id: 'lead-3',
      name: 'Conversación fría',
      phone: '34600000003',
      whatsappAuthorized: true,
    });
    messageFindFirst.mockResolvedValue(null); // no inbound inside the window

    const { req, res, json } = buildReqRes(['lead-3']);
    await bulkHandler()(req, res);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(createProactiveMessage).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failed: 1,
          errors: [expect.stringContaining('no inbound message')],
        }),
      })
    );
  });

  it('scopes the inbound lookup by tenant, session, direction and window', async () => {
    findFirst.mockResolvedValue({
      id: 'lead-4',
      name: 'Scope',
      phone: '34600000004',
      whatsappAuthorized: true,
    });

    const { req, res } = buildReqRes(['lead-4']);
    await bulkHandler()(req, res);

    expect(messageFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadId: 'lead-4',
          tenantId: TENANT,
          sessionId: 'session-1',
          direction: 'INBOUND',
          deletedAt: null,
          createdAt: { gte: expect.any(Date) },
        }),
      })
    );
  });
});

describe('POST /proactive-messages — consent gate (single send)', () => {
  function buildSingleReqRes(leadId: string) {
    const req = {
      body: { leadId, sessionId: 'session-1', content: 'hola' },
      tenantId: TENANT,
    } as unknown as Request;

    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { json, status } as unknown as Response;
    return { req, res, json, status };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    messageFindFirst.mockResolvedValue({ id: 'inbound-1' });
    createProactiveMessage.mockResolvedValue('proactive-1');
    updateProactiveMessageStatus.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue({ success: true });
  });

  it('rejects a lead without consent', async () => {
    findFirst.mockResolvedValue({ id: 'lead-1', phone: '34600000001', whatsappAuthorized: false });

    const { req, res, json, status } = buildSingleReqRes('lead-1');
    await singleHandler()(req, res);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('has not authorized') })
    );
  });

  it('rejects an authorized lead whose conversation went cold', async () => {
    findFirst.mockResolvedValue({ id: 'lead-2', phone: '34600000002', whatsappAuthorized: true });
    messageFindFirst.mockResolvedValue(null);

    const { req, res, json, status } = buildSingleReqRes('lead-2');
    await singleHandler()(req, res);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('no inbound message') })
    );
  });
});
