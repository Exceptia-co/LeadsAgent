import { makeBaileysReplyPort } from './baileys-reply-port';

const JID = '34600111222@s.whatsapp.net';

function makeSock() {
  return {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendPresenceUpdate: jest.fn().mockResolvedValue(undefined),
  } as any;
}

const message = { key: { remoteJid: JID, id: 'ABC123', fromMe: false } } as any;

describe('makeBaileysReplyPort', () => {
  it('reply_quotes_the_original_message', async () => {
    // The quote is the only thing separating reply from send. Dropping the
    // `quoted` option is a one-line change and must fail here.
    const sock = makeSock();

    await makeBaileysReplyPort(sock, message).reply('con cita');

    expect(sock.sendMessage).toHaveBeenCalledWith(JID, { text: 'con cita' }, { quoted: message });
  });

  it('send_does_not_quote', async () => {
    const sock = makeSock();

    await makeBaileysReplyPort(sock, message).send('sin cita');

    expect(sock.sendMessage).toHaveBeenCalledWith(JID, { text: 'sin cita' });
  });

  it('typing_maps_to_composing_and_paused_on_the_same_jid', async () => {
    const sock = makeSock();
    const port = makeBaileysReplyPort(sock, message);

    await port.startTyping();
    await port.stopTyping();

    expect(sock.sendPresenceUpdate.mock.calls).toEqual([
      ['composing', JID],
      ['paused', JID],
    ]);
  });
});
