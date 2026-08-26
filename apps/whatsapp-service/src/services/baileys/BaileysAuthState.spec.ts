import { initAuthCreds, proto } from '@whiskeysockets/baileys';
import { makeBaileysAuthState } from './BaileysAuthState';

function makeStore() {
  return {
    get: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(undefined),
    setBatch: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    hasCredentials: jest.fn().mockResolvedValue(false),
  } as any;
}

describe('makeBaileysAuthState', () => {
  it('generates_fresh_credentials_when_the_session_has_none', async () => {
    const store = makeStore();

    const { state } = await makeBaileysAuthState('s1', store);

    // Without this the test passes against an implementation that returns a
    // hardcoded object and never reads the store at all -- which would hand
    // every session brand-new credentials and lose the pairing on restart.
    // The exact arguments matter: reading a different category or key finds
    // nothing and regenerates, silently, for a session that had creds.
    expect(store.get).toHaveBeenCalledWith('s1', 'creds', ['creds']);
    // The whole initAuthCreds key set, not two fields: a stub carrying just
    // registrationId and noiseKey satisfies the pair below while missing the
    // Signal identity Baileys needs to complete a handshake.
    expect(Object.keys(state.creds).sort()).toEqual(Object.keys(initAuthCreds()).sort());
    expect(state.creds.registrationId).toEqual(expect.any(Number));
    expect(Buffer.isBuffer(state.creds.noiseKey.private)).toBe(true);
    expect(Buffer.isBuffer(state.creds.signedIdentityKey.public)).toBe(true);
    expect(state.creds.signedPreKey.keyId).toEqual(expect.any(Number));
    expect(typeof state.creds.advSecretKey).toBe('string');
  });

  it('revives_app_state_sync_keys_as_protobuf_messages', async () => {
    // protobufjs installs its own toJSON on the message prototype, and
    // JSON.stringify consults it before the store's replacer runs -- so what
    // comes back out is a plain object with a base64 string where Baileys
    // expects bytes. Baileys' own useMultiFileAuthState calls fromObject for
    // exactly this category. Without it, app-state sync fails days later,
    // silently, with the session still showing as connected.
    const store = makeStore();
    const original = proto.Message.AppStateSyncKeyData.fromObject({
      keyData: Buffer.from('0123456789abcdef0123456789abcdef', 'utf8'),
      fingerprint: { rawId: 7, currentIndex: 1, deviceIndexes: [0, 1] },
      timestamp: 1756000000000,
    });
    // What the store actually returns after a round-trip through JSON.
    store.get.mockResolvedValue({ k1: JSON.parse(JSON.stringify(original)) });

    const { state } = await makeBaileysAuthState('s1', store);
    const read = await state.keys.get('app-state-sync-key', ['k1']);

    // The class matters, not only the bytes: decoding the base64 by hand into
    // a plain object would satisfy a keyData-only assertion while handing
    // Baileys something that is not a protobuf message.
    expect(read.k1).toBeInstanceOf(proto.Message.AppStateSyncKeyData);
    expect(Buffer.from(read.k1!.keyData as Uint8Array)).toEqual(Buffer.from(original.keyData));
    expect(read.k1!.fingerprint!.deviceIndexes).toEqual([0, 1]);
    expect(read.k1!.timestamp!.toString()).toBe('1756000000000');
  });

  it('does_not_apply_fromObject_to_any_other_category', async () => {
    // session and sender-key are plain Uint8Array. Running them through a
    // protobuf constructor would corrupt them.
    const store = makeStore();
    const raw = Buffer.from([1, 2, 3, 4]);
    store.get.mockResolvedValue({ k1: raw });

    const { state } = await makeBaileysAuthState('s1', store);

    expect(await state.keys.get('session', ['k1'])).toEqual({ k1: raw });
    expect(await state.keys.get('sender-key', ['k1'])).toEqual({ k1: raw });
  });

  it('writes_the_whole_data_set_through_setBatch_not_one_call_per_category', async () => {
    const store = makeStore();
    const { state } = await makeBaileysAuthState('s1', store);

    await state.keys.set({
      'pre-key': { '1': null },
      session: { 'a.0': Buffer.from([9]) },
    } as any);

    // Assert the payload, not just its key names. An adapter that forwarded
    // the right categories with their values emptied -- or that dropped the
    // nulls, which are the deletions -- would satisfy a keys-only assertion
    // and lose every pre-key deletion silently.
    expect(store.setBatch).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.setBatch.mock.calls[0][0]).toBe('s1');
    expect(store.setBatch.mock.calls[0][1]).toStrictEqual({
      'pre-key': { '1': null },
      session: { 'a.0': Buffer.from([9]) },
    });
  });

  it('merges_partial_creds_updates_instead_of_replacing_them', async () => {
    // creds.update carries a patch, not a full record. myAppStateKeyId in
    // particular is assigned mid-handshake; persisting the patch alone would
    // drop noiseKey and every identity key with it, and the next boot would
    // demand a new QR.
    const store = makeStore();
    const { state, saveCreds } = await makeBaileysAuthState('s1', store);
    const originalNoiseKey = state.creds.noiseKey.private;

    await saveCreds({ myAppStateKeyId: 'AAAA' } as any);

    expect(store.setBatch).toHaveBeenCalledTimes(1);
    const written = store.setBatch.mock.calls[0][1].creds.creds as any;
    expect(written.myAppStateKeyId).toBe('AAAA');
    expect(written.noiseKey.private).toEqual(originalNoiseKey);
    // And the in-memory object Baileys keeps reading must have moved too.
    expect(state.creds.myAppStateKeyId).toBe('AAAA');
  });

  it('a_key_the_store_cannot_return_is_simply_absent', async () => {
    const store = makeStore();
    store.get.mockResolvedValue({});

    const { state } = await makeBaileysAuthState('s1', store);
    const read = await state.keys.get('session', ['missing']);

    // toStrictEqual, not toEqual: Jest's toEqual ignores properties whose
    // value is undefined, so `{ missing: undefined }` would pass -- and that
    // is precisely the distinction this test claims to make. Baileys checks
    // key presence, so an explicit undefined is not the same as absence.
    expect(read).toStrictEqual({});
    expect(read).not.toHaveProperty('missing');
  });
});
