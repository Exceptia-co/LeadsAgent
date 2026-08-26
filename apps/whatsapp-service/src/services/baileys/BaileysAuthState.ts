import { initAuthCreds, proto } from '@whiskeysockets/baileys';
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import type { SessionCredentialsStore } from '../session-credentials/SessionCredentialsStore';

const CREDS_CATEGORY = 'creds';
const CREDS_KEY = 'creds';

/**
 * Baileys' AuthenticationState over the durable credential store.
 *
 * This is the only file that knows one Signal category is a protobuf message.
 * The store deliberately stays protobuf-agnostic: it seals and unseals JSON
 * and nothing else.
 */
export async function makeBaileysAuthState(
  sessionId: string,
  store: SessionCredentialsStore
): Promise<{
  state: AuthenticationState;
  saveCreds: (update: Partial<AuthenticationCreds>) => Promise<void>;
}> {
  const stored = await store.get(sessionId, CREDS_CATEGORY, [CREDS_KEY]);
  // makeWASocket reads `creds` synchronously at construction, so it has to be
  // a plain resolved object -- not a promise, not a lazy proxy.
  const creds: AuthenticationCreds = (stored[CREDS_KEY] as AuthenticationCreds) ?? initAuthCreds();

  const persistCreds = () =>
    store.setBatch(sessionId, { [CREDS_CATEGORY]: { [CREDS_KEY]: creds } });

  const state: AuthenticationState = {
    creds,
    keys: {
      async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
        const rows = await store.get(sessionId, type as string, ids);
        if (type !== 'app-state-sync-key') {
          return rows as { [id: string]: SignalDataTypeMap[T] };
        }
        // JSON.stringify called protobufjs's own toJSON on the way in, so
        // `keyData` is a base64 string and `timestamp` a string by now.
        // fromObject accepts both and rebuilds the message byte-for-byte.
        const revived: Record<string, unknown> = {};
        for (const [id, value] of Object.entries(rows)) {
          revived[id] = proto.Message.AppStateSyncKeyData.fromObject(value as object);
        }
        return revived as { [id: string]: SignalDataTypeMap[T] };
      },

      async set(data: SignalDataSet): Promise<void> {
        // One transaction for the whole set. Splitting it per category would
        // let a pre-key deletion commit while its matching session write does
        // not, which desynchronises the ratchet with no way back.
        await store.setBatch(sessionId, data as Record<string, Record<string, unknown | null>>);
      },
    },
  };

  return {
    state,
    async saveCreds(update: Partial<AuthenticationCreds>): Promise<void> {
      // creds.update is a patch. Mutating the same object Baileys holds keeps
      // its in-memory view and the persisted row in step; replacing it would
      // leave Baileys writing into an orphan.
      Object.assign(creds, update);
      await persistCreds();
    },
  };
}
