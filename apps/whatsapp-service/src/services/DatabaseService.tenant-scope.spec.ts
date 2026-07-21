const mockQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    on: jest.fn(),
    end: jest.fn(),
  })),
}));

jest.mock('@leadcrm/db', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
  MessageDirection: { INBOUND: 'INBOUND', OUTBOUND: 'OUTBOUND' },
  MessageType: { TEXT: 'TEXT' },
  Prisma: {},
}));

jest.mock('./PhoneNumberService', () => ({
  __esModule: true,
  default: { normalizePhoneNumber: (p: string) => p },
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import DatabaseService from './DatabaseService';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(() => {
  mockQuery.mockReset();
});

describe('getTemplate — tenant-scoped', () => {
  it('includes tenant_id in WHERE clause', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: ITEM_ID }] });

    await DatabaseService.getTemplate(TENANT_ID, ITEM_ID);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(params).toContain(TENANT_ID);
    expect(params).toContain(ITEM_ID);
  });
});

describe('incrementTemplateUsage — tenant-scoped', () => {
  it('includes tenant_id in WHERE clause', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await DatabaseService.incrementTemplateUsage(TENANT_ID, ITEM_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(params).toContain(TENANT_ID);
  });
});

describe('updateProactiveMessageStatus — tenant-scoped', () => {
  it('includes tenant_id in WHERE clause', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: ITEM_ID }] });

    await DatabaseService.updateProactiveMessageStatus(TENANT_ID, ITEM_ID, 'sent');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(params).toContain(TENANT_ID);
    expect(params).toContain(ITEM_ID);
  });
});

describe('deleteMessageTemplate — tenant-scoped', () => {
  it('includes tenant_id in WHERE clause', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: ITEM_ID }] });

    await DatabaseService.deleteMessageTemplate(TENANT_ID, ITEM_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(params).toContain(TENANT_ID);
  });
});

describe('logWhitelistDecision — tenant-scoped', () => {
  it('includes tenant_id in INSERT when tenantId is provided', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'log-1' }] });

    await DatabaseService.logWhitelistDecision({
      tenantId: TENANT_ID,
      phoneNumber: '+5491155556666',
      decision: 'ALLOWED',
      reason: 'test',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(params[0]).toBe(TENANT_ID);
  });

  it('inserts without tenant_id column when tenantId is missing (no regression)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'log-2' }] });

    await DatabaseService.logWhitelistDecision({
      phoneNumber: '+5491155556666',
      decision: 'ALLOWED',
      reason: 'test',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('tenant_id');
    expect(params[0]).toBe('+5491155556666');
  });
});

describe('cleanupOldTrainingInteractions — SQL injection fix', () => {
  it('uses parameterized query for daysOld (no string interpolation)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await DatabaseService.cleanupOldTrainingInteractions(undefined, 90);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain("'90 days'");
    expect(sql).toContain("INTERVAL '1 day' * $1");
    expect(params[0]).toBe(90);
  });

  it('includes tenant_id filter when tenantId is provided', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await DatabaseService.cleanupOldTrainingInteractions(TENANT_ID, 30);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(params).toContain(TENANT_ID);
  });
});

describe('getMessageTemplates — tenant-scoped', () => {
  it('includes tenant_id in WHERE clause', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await DatabaseService.getMessageTemplates(TENANT_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(params[0]).toBe(TENANT_ID);
  });
});

describe('createMessageTemplate — tenant-scoped', () => {
  it('includes tenant_id in INSERT', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: ITEM_ID }] });

    await DatabaseService.createMessageTemplate({
      tenantId: TENANT_ID,
      name: 'Test',
      category: 'general',
      content: 'Hello {{nombre}}',
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(params[0]).toBe(TENANT_ID);
  });
});

describe('findLeadByPhone — tenant-scoped', () => {
  it('passes tenantId to getAllLeads when provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [] });

    await DatabaseService.findLeadByPhone('+5491155556666', { tenantId: TENANT_ID });

    const allLeadsCalls = mockQuery.mock.calls.filter(([sql]: [string]) =>
      sql.includes('FROM leads')
    );
    expect(allLeadsCalls.length).toBeGreaterThan(0);
    const [sql, params] = allLeadsCalls[0];
    expect(sql).toContain('tenant_id');
    expect(params[0]).toBe(TENANT_ID);
  });

  it('refuses without tenantId — returns null and never queries (fail-closed)', async () => {
    const result = await DatabaseService.findLeadByPhone('+5491155556666', undefined as any);

    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('createLead — tenant-scoped', () => {
  it('includes tenant_id in INSERT when tenantId is provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({
        rows: [{ id: ITEM_ID, name: 'Test', phone: '+5491155556666', status: 'NUEVO', source: 'manual', whatsapp_authorized: true, created_at: new Date(), updated_at: new Date() }],
      });

    await DatabaseService.createLead(
      { phone: '+5491155556666', name: 'Test' },
      { tenantId: TENANT_ID },
    );

    const insertCalls = mockQuery.mock.calls.filter(([sql]: [string]) =>
      sql.includes('INSERT INTO leads')
    );
    expect(insertCalls.length).toBe(1);
    const [sql, params] = insertCalls[0];
    expect(sql).toContain('tenant_id');
    expect(params[0]).toBe(TENANT_ID);
  });
});

describe('updateLeadWhatsAppAuth — tenant-scoped', () => {
  it('includes tenant_id in WHERE when tenantId is provided', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: ITEM_ID }] });

    await DatabaseService.updateLeadWhatsAppAuth(ITEM_ID, true, { tenantId: TENANT_ID });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(params).toContain(TENANT_ID);
  });

  it('refuses without tenantId — returns false and never queries (fail-closed)', async () => {
    const result = await DatabaseService.updateLeadWhatsAppAuth(ITEM_ID, true, undefined as any);

    expect(result).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
