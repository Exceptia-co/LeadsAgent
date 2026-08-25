import { normalizeBaileysMessage } from './baileys-normalizer';

const SESSION_ID = 'smoke';

function waMessage(overrides: any = {}): any {
  return {
    key: {
      remoteJid: '34600111222@s.whatsapp.net',
      fromMe: false,
      id: 'ABC123',
      ...(overrides.key ?? {}),
    },
    // `in`, not `??`: the drop-a-contentless-message test passes
    // `{ message: null }`, and `??` would hand back the default instead --
    // making that assertion unfailable by any implementation.
    message: 'message' in overrides ? overrides.message : { conversation: 'hola' },
    messageTimestamp: overrides.messageTimestamp ?? 1756000000,
    pushName: 'Tester',
  };
}

describe('normalizeBaileysMessage', () => {
  it('normalizes_a_plain_one_to_one_text_message', () => {
    expect(normalizeBaileysMessage(waMessage(), SESSION_ID)).toEqual({
      id: `${SESSION_ID}:ABC123`,
      sessionId: SESSION_ID,
      senderPhone: '34600111222',
      recipientPhone: '34600111222',
      text: 'hola',
      timestamp: 1756000000,
      type: 'text',
      isGroup: false,
      fromMe: false,
    });
  });

  it('reads_the_phone_from_senderPn_when_the_jid_is_a_lid', () => {
    // A LID's user part is a 15-digit number, which passes /^[1-9]\d{7,14}$/
    // exactly like a real phone number. Trusting remoteJid here would mint a
    // plausible-looking number belonging to nobody, create a Lead under it,
    // and answer a stranger. This is the single most dangerous line in the
    // file, and removing the isLidUser branch must fail here.
    const dto = normalizeBaileysMessage(
      waMessage({ key: { remoteJid: '182736451827364@lid', senderPn: '34600111222@s.whatsapp.net' } }),
      SESSION_ID
    );

    expect(dto?.senderPhone).toBe('34600111222');
  });

  it('returns_null_for_a_lid_with_no_phone_number_attached', () => {
    // Better a dropped message than a message attributed to an invented
    // number. Returning a partial DTO here is what the null exists to prevent.
    expect(
      normalizeBaileysMessage(waMessage({ key: { remoteJid: '182736451827364@lid' } }), SESSION_ID)
    ).toBeNull();
  });

  it('takes_the_sender_from_the_participant_in_a_group', () => {
    const dto = normalizeBaileysMessage(
      waMessage({
        key: {
          remoteJid: '120363000000000000@g.us',
          participant: '34600111222@s.whatsapp.net',
        },
      }),
      SESSION_ID
    );

    expect(dto?.isGroup).toBe(true);
    expect(dto?.senderPhone).toBe('34600111222');
    expect(dto?.recipientPhone).toBeNull();
  });

  it('unwraps_an_ephemeral_message_before_reading_its_type_and_text', () => {
    // getContentType on the wrapper returns 'ephemeralMessage' and the text is
    // lost. Disappearing-message chats are ordinary, so skipping the unwrap
    // silently drops every message from them. Deleting the
    // extractMessageContent call is a one-line change and must fail here.
    const dto = normalizeBaileysMessage(
      waMessage({ message: { ephemeralMessage: { message: { conversation: 'efímero' } } } }),
      SESSION_ID
    );

    expect(dto?.type).toBe('text');
    expect(dto?.text).toBe('efímero');
  });

  it('reads_text_from_extendedTextMessage_and_from_media_captions', () => {
    expect(
      normalizeBaileysMessage(
        waMessage({ message: { extendedTextMessage: { text: 'con enlace' } } }),
        SESSION_ID
      )
    ).toMatchObject({ type: 'text', text: 'con enlace' });

    expect(
      normalizeBaileysMessage(
        waMessage({ message: { imageMessage: { caption: 'pie de foto' } } }),
        SESSION_ID
      )
    ).toMatchObject({ type: 'image', text: 'pie de foto' });

    expect(
      normalizeBaileysMessage(waMessage({ message: { audioMessage: {} } }), SESSION_ID)
    ).toMatchObject({ type: 'audio', text: '' });
  });

  it('coerces_a_long_timestamp_to_a_plain_number_of_seconds', () => {
    // protobufjs hands back a Long for int64 fields. Writing that object into
    // the DTO puts {low, high, unsigned} on the frozen webhook wire, where
    // apps/api does `new Date(timestamp * 1000)` on it.
    const dto = normalizeBaileysMessage(
      waMessage({ messageTimestamp: { low: 1756000000, high: 0, unsigned: false } }),
      SESSION_ID
    );

    expect(typeof dto?.timestamp).toBe('number');
    expect(dto?.timestamp).toBe(1756000000);
  });

  it('drops_a_message_with_no_id_and_a_message_with_no_content', () => {
    expect(normalizeBaileysMessage(waMessage({ key: { id: undefined } }), SESSION_ID)).toBeNull();
    expect(normalizeBaileysMessage(waMessage({ message: null }), SESSION_ID)).toBeNull();
  });

  it('prefixes_the_dto_id_with_the_session_it_was_normalized_for', () => {
    // Two tenants can legitimately see the same provider message id. The
    // pipeline's Redis dedupe key is built from dto.id alone, so the session
    // scope has to be introduced here or one tenant's message silently
    // suppresses another's.
    const a = normalizeBaileysMessage(waMessage(), 'tenant-a');
    const b = normalizeBaileysMessage(waMessage(), 'tenant-b');

    expect(a?.id).toBe('tenant-a:ABC123');
    expect(b?.id).toBe('tenant-b:ABC123');
  });
});
