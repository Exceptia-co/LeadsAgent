import DatabaseService from './DatabaseService';

const create = jest.fn().mockResolvedValue({ id: 'msg-1' });
const conversationCreate = jest.fn().mockResolvedValue({ id: 'conv-1' });
const leadUpdate = jest.fn().mockResolvedValue({ count: 1 });

const BASE = { sessionId: 's1', phoneNumber: '34600111222' };

beforeEach(() => {
  jest.clearAllMocks();
  (DatabaseService as any).prisma = {
    lead: { findFirst: jest.fn().mockResolvedValue({ id: 'lead-1', status: 'NUEVO' }) },
    $transaction: async (fn: any) =>
      fn({
        message: { create },
        whatsAppConversation: { create: conversationCreate },
        lead: { updateMany: leadUpdate },
      }),
  };
  jest.spyOn(DatabaseService as any, 'getSessionTenantId').mockResolvedValue('tenant-1');
});

describe('saveConversation records what the CRM needs', () => {
  it('marks an inbound READ rather than leaving it PENDING', async () => {
    // Every row this writer produces is PENDING, because the writer that set
    // READ was the Nest handler that never ran. (Nest's manual outbound path
    // does write SENT, so this is about saveConversation's rows, not every
    // row in the table.) A status column that holds one value for every
    // message the bot handles is not a status column.
    await DatabaseService.saveConversation({
      ...BASE,
      messageText: 'hola',
      isFromUser: true,
      status: 'READ',
    });

    expect(create.mock.calls[0][0].data.status).toBe('READ');
  });

  it('marks a dispatched reply SENT', async () => {
    await DatabaseService.saveConversation({
      ...BASE,
      responseText: 'hola!',
      isFromUser: false,
      status: 'SENT',
    });

    expect(create.mock.calls[0][0].data.status).toBe('SENT');
  });

  it("keeps the transport's message id", async () => {
    await DatabaseService.saveConversation({
      ...BASE,
      messageText: 'hola',
      isFromUser: true,
      providerMessageId: '3EB0ABC',
    });

    expect(create.mock.calls[0][0].data.whatsappMessageId).toBe('3EB0ABC');
  });

  it('uses the time WhatsApp reports, not the time we wrote the row', async () => {
    const occurredAt = new Date('2026-08-27T10:00:00.000Z');

    await DatabaseService.saveConversation({
      ...BASE,
      messageText: 'hola',
      isFromUser: true,
      occurredAt,
    });

    expect(create.mock.calls[0][0].data.createdAt).toEqual(occurredAt);
  });

  it('lets the column default when no usable timestamp was given', async () => {
    // Omitted, never nulled and never an Invalid Date: that is how T3 put
    // production rows in 1970 once already.
    await DatabaseService.saveConversation({ ...BASE, messageText: 'hola', isFromUser: true });

    expect(create.mock.calls[0][0].data.createdAt).toBeUndefined();
  });

  it('records the contact time on an inbound', async () => {
    await DatabaseService.saveConversation({ ...BASE, messageText: 'hola', isFromUser: true });

    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'lead-1', tenantId: 'tenant-1', deletedAt: null }),
        data: expect.objectContaining({ lastContact: expect.any(Date) }),
      })
    );
  });

  it('promotes to CONTACTADO through the WHERE, not through a value read earlier', async () => {
    // The lead was fetched before the transaction opened. Deciding from the
    // status we read then lets an inbound drag a lead that became GANADO in
    // the meantime back to CONTACTADO. The condition has to reach the
    // database.
    await DatabaseService.saveConversation({ ...BASE, messageText: 'hola', isFromUser: true });

    const promotion = leadUpdate.mock.calls.find(c => c[0].data?.status === 'CONTACTADO');
    expect(promotion).toBeDefined();
    expect(promotion![0].where).toMatchObject({ status: 'NUEVO' });
  });

  it('leaves the lead alone on an outbound', async () => {
    // A reply we sent is not the contact writing in.
    await DatabaseService.saveConversation({
      ...BASE,
      responseText: 'hola!',
      isFromUser: false,
      status: 'SENT',
    });

    expect(leadUpdate).not.toHaveBeenCalled();
  });
});
