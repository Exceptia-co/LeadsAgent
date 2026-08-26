import {
  Browsers,
  DisconnectReason,
  jidDecode,
  makeCacheableSignalKeyStore,
  makeWASocket,
} from '@whiskeysockets/baileys';
import type {
  AuthenticationCreds,
  AuthenticationState,
  BaileysEventMap,
  ConnectionState,
  WASocket,
} from '@whiskeysockets/baileys';
// ILogger never reaches the package root in 6.7.24; same subpath import the
// logger adapter uses.
import type { ILogger } from '@whiskeysockets/baileys/lib/Utils/logger';

import { redisClient, REDIS_KEYS } from '../../config/redis';
import { logger } from '../../utils/logger';
import type { SendMessageResponse, WhatsAppSession } from '../../types';
import type { SessionCredentialsStore } from '../session-credentials/SessionCredentialsStore';
import type { WhatsAppEventPublisher } from '../WhatsAppEventPublisher';
import type { IncomingMessagePipeline } from '../whatsapp-core/IncomingMessagePipeline';
import { makeBaileysAuthState } from './BaileysAuthState';
import { makeBaileysLogger } from './baileys-logger';
import { normalizeBaileysMessage } from './baileys-normalizer';
import { makeBaileysReplyPort } from './baileys-reply-port';

/**
 * Reconnect backoff, capped at 60 s and at five consecutive attempts.
 *
 * Baileys does not reconnect on its own, so rebuilding the socket is the
 * application's job -- and a naive `connection: 'close'` -> rebuild is an
 * unthrottled loop against WhatsApp's servers. Ban risk follows sending
 * behaviour, and this migration was approved on the understanding that it does
 * not make that risk worse.
 */
const RETRY_SCHEDULE_MS = [2000, 5000, 10000, 30000, 60000];

interface SessionHandlers {
  connection: (update: Partial<ConnectionState>) => void;
  creds: (update: Partial<AuthenticationCreds>) => void;
  upsert: (upsert: BaileysEventMap['messages.upsert']) => void;
}

/** Everything a session needs that is not part of its published shape. */
interface SessionRuntime {
  /**
   * Built once per session and reused across reconnects: the cacheable key
   * store exists to survive them, and re-reading `creds` from the database on
   * every rebuild would only risk diverging from the object Baileys mutates.
   */
  auth: AuthenticationState;
  saveCreds: (update: Partial<AuthenticationCreds>) => Promise<void>;
  log: ILogger;
  /** The exact listener identities currently subscribed, so `off` can hit them. */
  handlers?: SessionHandlers;
  attempts: number;
  credsAnnounced: boolean;
  openAnnounced: boolean;
}

export interface BaileysSessionManagerDeps {
  store: SessionCredentialsStore;
  publisher: WhatsAppEventPublisher;
  pipeline: IncomingMessagePipeline;
  updateSessionStatus(sessionId: string, status: string, data?: unknown): Promise<void>;
  handleSessionDisconnect(sessionId: string, type: string, reason?: unknown): Promise<void>;
  /** Extra milliseconds added to each backoff rung. Defaults to Math.random() * 1000. */
  jitter?: () => number;
}

export interface SessionHealth {
  status: string;
  /**
   * Name preserved, source changed: it is `store.hasCredentials` now, not a
   * file on disk. Renaming it is a dashboard change and does not belong here.
   */
  hasLocalAuth: boolean;
  heartbeatAge?: number;
  authInvalidated?: boolean;
}

/** Boom carries the code; the union also admits a plain Error, which has none. */
function statusCodeOf(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } })?.output?.statusCode;
}

function toJid(to: string): string {
  return to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
}

/**
 * The single runtime import of Baileys: owns the sockets, the in-memory
 * session map and the reconnect policy.
 *
 * Persistence stays behind the injected `updateSessionStatus` /
 * `handleSessionDisconnect`, so this class never touches Prisma. The eight
 * whatsapp-web.js lifecycle events collapse into `connection.update`, which
 * makes the mapping to session states application logic; two status codes
 * decide it, and everything else is a reconnect.
 */
export class BaileysSessionManager {
  private readonly sessions = new Map<string, WhatsAppSession>();
  private readonly sockets = new Map<string, WASocket>();
  private readonly runtimes = new Map<string, SessionRuntime>();
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();
  /**
   * Sessions that must not be rebuilt. The close handler awaits
   * `handleSessionDisconnect` before it reaches the scheduling line, so a
   * teardown can run to completion inside that await; `clearTimeout` cannot
   * cancel a `setTimeout` that does not exist yet, only this re-check can.
   */
  private readonly stopped = new Set<string>();
  private readonly jitter: () => number;

  // Inert on purpose: `makeWASocket` is reachable only from createSession, so
  // importing this module can never open a socket.
  constructor(private readonly deps: BaileysSessionManagerDeps) {
    this.jitter = deps.jitter ?? (() => Math.random() * 1000);
  }

  async createSession(sessionId: string, tenantId?: string): Promise<WhatsAppSession> {
    this.stopped.delete(sessionId);

    const { state, saveCreds } = await makeBaileysAuthState(sessionId, this.deps.store);
    // Never the repo logger: it does not satisfy ILogger and its argument
    // order is inverted.
    const log = makeBaileysLogger({ sessionId });

    this.runtimes.set(sessionId, {
      // One cacheable key store per session. The third parameter is the cache;
      // left unset, each call builds its own. Hoisting this to module scope
      // would share one cache across every session and cross two tenants'
      // Signal keys in memory.
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, log) },
      saveCreds,
      log,
      attempts: 0,
      credsAnnounced: false,
      openAnnounced: false,
    });

    const session: WhatsAppSession = {
      id: sessionId,
      clientId: sessionId,
      status: 'connecting',
      lastSeen: new Date(),
      webhookUrl: process.env.WEBHOOK_URL,
      metadata: { tenantId },
    };
    this.sessions.set(sessionId, session);

    this.openSocket(sessionId);
    logger.info(`📱 Baileys session ${sessionId} created`);
    return session;
  }

  getSession(sessionId: string): WhatsAppSession | null {
    return this.sessions.get(sessionId) || null;
  }

  async getAllSessions(): Promise<WhatsAppSession[]> {
    return Array.from(this.sessions.values());
  }

  isSessionReady(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.status === 'ready';
  }

  async sendMessage(sessionId: string, to: string, text: string): Promise<SendMessageResponse> {
    const sock = this.sockets.get(sessionId);
    if (!sock) {
      return { success: false, error: `Session ${sessionId} not found` };
    }

    try {
      const sent = await sock.sendMessage(toJid(to), { text });
      return { success: true, messageId: sent?.key?.id ?? undefined, timestamp: new Date() };
    } catch (error) {
      logger.error(`Error sending message in session ${sessionId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * `'shutdown'` must not clear credentials: a pm2 restart is not a tenant
   * logging out. That is the Phase 1 Task 1 contract, and breaking it
   * reintroduces the bug that left thirty dead sessions in production.
   */
  async destroySession(sessionId: string, mode: 'shutdown' | 'delete'): Promise<void> {
    // Before anything is torn down, so a close handler suspended mid-await
    // finds the session already stopped when it resumes.
    this.stopped.add(sessionId);
    this.clearRetry(sessionId);

    const sock = this.sockets.get(sessionId);
    if (sock) {
      // Unsubscribe first: end() emits connection.update{close} and a still
      // subscribed handler would schedule a fresh retry from inside the
      // shutdown itself.
      this.detach(sessionId, sock);
      if (mode === 'delete') {
        try {
          await sock.logout();
        } catch (error) {
          logger.warn(`Logout failed for session ${sessionId} (continuing):`, error);
        }
      }
      try {
        sock.end(undefined);
      } catch (error) {
        logger.warn(`Error ending socket for session ${sessionId}:`, error);
      }
      this.sockets.delete(sessionId);
    }

    this.sessions.delete(sessionId);
    this.runtimes.delete(sessionId);

    // Wipe second, and only on a real delete. A creds.update still in flight
    // would otherwise land after the wipe and write fresh rows for a session
    // that no longer exists -- orphaned credentials hasCredentials would
    // happily report as ready to recover.
    if (mode === 'delete') {
      await this.deps.store.clear(sessionId);
    }
    logger.info(`🗑️ Baileys session ${sessionId} torn down (${mode})`);
  }

  async shutdownAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    // Mark every session stopped before the first teardown: a close still in
    // flight for a later session must not schedule a retry while an earlier
    // one is being torn down.
    for (const sessionId of sessionIds) this.stopped.add(sessionId);
    for (const sessionId of sessionIds) await this.destroySession(sessionId, 'shutdown');
  }

  /** Pause: the socket goes, the credentials stay, so no new QR is needed. */
  async forceDisconnect(sessionId: string): Promise<void> {
    this.stopped.add(sessionId);
    this.clearRetry(sessionId);

    const sock = this.sockets.get(sessionId);
    if (sock) {
      this.detach(sessionId, sock);
      try {
        sock.end(undefined);
      } catch (error) {
        logger.warn(`Error ending socket for session ${sessionId}:`, error);
      }
      this.sockets.delete(sessionId);
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'disconnected';
      session.lastSeen = new Date();
    }

    await this.deps.updateSessionStatus(sessionId, 'disconnected', {
      lastError: 'Force disconnected by user',
      metadata: {
        autoReconnect: false,
        forceDisconnected: true,
        disconnectedAt: new Date().toISOString(),
      },
    });
  }

  async getSessionHealth(sessionId: string): Promise<SessionHealth> {
    const session = this.sessions.get(sessionId);
    const hasLocalAuth = await this.deps.store.hasCredentials(sessionId);

    let heartbeatAge: number | undefined;
    try {
      const heartbeat = await redisClient.get(`${REDIS_KEYS.SESSION_HEARTBEAT}${sessionId}`);
      if (heartbeat) heartbeatAge = Date.now() - parseInt(heartbeat, 10);
    } catch {
      /* the heartbeat is a staleness hint, not a health gate */
    }

    return {
      status: session?.status || 'unknown',
      hasLocalAuth,
      heartbeatAge,
      authInvalidated:
        session?.metadata?.authInvalidated === true || session?.status === 'auth_failure',
    };
  }

  // ── socket lifecycle ──────────────────────────────────────────────────────

  private openSocket(sessionId: string): void {
    const runtime = this.runtimes.get(sessionId);
    const sock = makeWASocket({
      auth: runtime.auth,
      logger: runtime.log,
      // Would dump pairing codes into the production log.
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      // Would replay old conversations through the AI and answer them.
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    this.sockets.set(sessionId, sock);
    this.attach(sessionId, sock);
  }

  /**
   * Tear down before building. The map cannot be replaced in one step -- there
   * is nothing to replace it with until makeWASocket returns -- so it is
   * cleared first and repopulated after.
   *
   * A reconnect that leaves the old emitter subscribed keeps a live listener
   * on a dead socket, and every inbound message reaches the pipeline twice
   * under two socket objects. Redis dedupe hides that for 300 seconds: long
   * enough to survive a smoke test and surface later as duplicate replies.
   */
  private rebuild(sessionId: string): void {
    if (this.stopped.has(sessionId) || !this.runtimes.has(sessionId)) return;

    const previous = this.sockets.get(sessionId);
    if (previous) {
      this.detach(sessionId, previous);
      try {
        previous.end(undefined);
      } catch (error) {
        logger.warn(`Error ending previous socket for session ${sessionId}:`, error);
      }
      this.sockets.delete(sessionId);
    }
    this.openSocket(sessionId);
  }

  private attach(sessionId: string, sock: WASocket): void {
    const runtime = this.runtimes.get(sessionId);
    const guard = (work: Promise<void>): void => {
      work.catch(error => logger.error(`Baileys handler failed for ${sessionId}:`, error));
    };
    const handlers: SessionHandlers = {
      connection: update => guard(this.onConnectionUpdate(sessionId, sock, update)),
      creds: update => guard(this.onCredsUpdate(sessionId, update)),
      upsert: upsert => guard(this.onMessagesUpsert(sessionId, sock, upsert)),
    };
    runtime.handlers = handlers;

    sock.ev.on('connection.update', handlers.connection);
    sock.ev.on('creds.update', handlers.creds);
    sock.ev.on('messages.upsert', handlers.upsert);
  }

  private detach(sessionId: string, sock: WASocket): void {
    const handlers = this.runtimes.get(sessionId)?.handlers;
    if (!handlers) return;

    sock.ev.off('connection.update', handlers.connection);
    sock.ev.off('creds.update', handlers.creds);
    sock.ev.off('messages.upsert', handlers.upsert);
  }

  // ── event handlers ────────────────────────────────────────────────────────

  private async onCredsUpdate(
    sessionId: string,
    update: Partial<AuthenticationCreds>
  ): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;

    // creds.update fires repeatedly through one handshake -- keys rotate,
    // myAppStateKeyId arrives, the account record fills in. The flag flips
    // synchronously so a burst still produces exactly one webhook.
    const first = !runtime.credsAnnounced;
    runtime.credsAnnounced = true;

    await runtime.saveCreds(update);

    if (first) {
      // First of the two the dashboard expects: credentials exist, so it can
      // stop showing the QR while the connection finishes coming up.
      await this.deps.publisher.sendWebhook({
        event: 'authenticated',
        sessionId,
        data: { number: 'unknown' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async onConnectionUpdate(
    sessionId: string,
    sock: WASocket,
    update: Partial<ConnectionState>
  ): Promise<void> {
    if (update.qr) await this.onQr(sessionId, update.qr);
    if (update.connection === 'open') await this.onOpen(sessionId, sock);
    if (update.connection === 'close') await this.onClose(sessionId, update.lastDisconnect?.error);
  }

  private async onQr(sessionId: string, qr: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'connecting';
      session.qrCode = qr;
      session.lastSeen = new Date();
    }

    await this.deps.updateSessionStatus(sessionId, 'connecting', { qrCode: qr });
    await this.deps.publisher.sendWebhook({
      event: 'qr_updated',
      sessionId,
      data: { qrCode: qr },
      timestamp: new Date().toISOString(),
    });
  }

  private async onOpen(sessionId: string, sock: WASocket): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    const number = jidDecode(sock.user?.id)?.user ?? 'unknown';

    // A clean connection ends the backoff: a session that reconnects fine five
    // times over a month must not be out of retries on the sixth blip.
    this.clearRetry(sessionId);
    if (runtime) runtime.attempts = 0;

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'ready';
      session.connectedNumber = number;
      session.qrCode = undefined;
      session.lastSeen = new Date();
    }

    // Two authenticated webhooks per session lifecycle, not per connection:
    // `open` fires again after every reconnect, and Phase 1 froze the shape
    // the dashboard's session:connected depends on. Flipped synchronously so
    // two opens in the same tick cannot both pass the check.
    const announce = !!runtime && !runtime.openAnnounced;
    if (announce) runtime.openAnnounced = true;

    await this.deps.updateSessionStatus(sessionId, 'ready', {
      connectedNumber: number,
      lastHealthCheck: new Date(),
    });

    if (announce) {
      await this.deps.publisher.sendWebhook({
        event: 'authenticated',
        sessionId,
        data: { number },
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async onClose(sessionId: string, error: unknown): Promise<void> {
    const code = statusCodeOf(error);

    // Whatever happens next, the session is not ready: during a rebuild the
    // socket map is empty between delete and set.
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'connecting';
      session.lastSeen = new Date();
    }

    // 515 fires on the first pairing and is a normal step. Treating it as a
    // failure is the classic integration bug: the session pairs, instantly
    // "fails", and never comes up.
    if (code === DisconnectReason.restartRequired) {
      logger.info(`Session ${sessionId} requested a restart (515), reconnecting immediately`);
      this.rebuild(sessionId);
      return;
    }

    // connectionLost and timedOut are both 408 and cannot be told apart, so
    // nothing tries: 401 is the only code that means the credentials are dead.
    const loggedOut = code === DisconnectReason.loggedOut;

    // Injected so the persisted row and its reconnectCount keep being
    // maintained the way they are today.
    await this.deps.handleSessionDisconnect(
      sessionId,
      loggedOut ? 'WHATSAPP_LOGGED_OUT' : 'WHATSAPP_DISCONNECT',
      code ?? 'unknown'
    );

    // Every await between the close event and the schedule is a place where
    // the session can be destroyed underneath us. Check after the last one.
    if (this.stopped.has(sessionId)) return;

    if (loggedOut) {
      await this.markLoggedOut(sessionId);
      return;
    }
    await this.scheduleRetry(sessionId, code);
  }

  private async onMessagesUpsert(
    sessionId: string,
    sock: WASocket,
    upsert: BaileysEventMap['messages.upsert']
  ): Promise<void> {
    // 'append' is history sync. Feeding it to the pipeline would replay old
    // conversations through the AI and answer them.
    if (upsert.type !== 'notify') return;

    for (const message of upsert.messages ?? []) {
      if (message.key?.remoteJid === 'status@broadcast') continue;

      const dto = normalizeBaileysMessage(message, sessionId);
      if (!dto) continue;

      await this.deps.pipeline.handle(dto, makeBaileysReplyPort(sock, message));
    }
  }

  // ── reconnect policy ──────────────────────────────────────────────────────

  private async scheduleRetry(sessionId: string, code?: number): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;

    const attempt = runtime.attempts + 1;
    if (attempt > RETRY_SCHEDULE_MS.length) {
      await this.markGaveUp(sessionId, code);
      return;
    }
    runtime.attempts = attempt;

    // Jitter so every session on the box does not retry in lockstep after a
    // network blip and arrive as one burst.
    const delay = RETRY_SCHEDULE_MS[attempt - 1] + this.jitter();

    // At most one pending retry per session: `close` can arrive more than once
    // for a single disconnect -- the socket emits it, and end() emits it again
    // during teardown -- and two timers racing produce two live sockets.
    this.clearRetry(sessionId);
    this.retryTimers.set(
      sessionId,
      setTimeout(() => {
        this.retryTimers.delete(sessionId);
        this.rebuild(sessionId);
      }, delay)
    );
    logger.warn(
      `Session ${sessionId} closed (code ${code ?? 'unknown'}); reconnect attempt ${attempt} in ${Math.round(delay)}ms`
    );
  }

  private async markGaveUp(sessionId: string, code?: number): Promise<void> {
    this.clearRetry(sessionId);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'disconnected';
      session.lastSeen = new Date();
    }

    logger.error(
      `Session ${sessionId} gave up after ${RETRY_SCHEDULE_MS.length} reconnect attempts (last code ${code ?? 'unknown'})`
    );
    await this.deps.updateSessionStatus(sessionId, 'disconnected', {
      lastError: `Reconnect budget exhausted after ${RETRY_SCHEDULE_MS.length} attempts (last code ${code ?? 'unknown'})`,
      metadata: { autoReconnect: false, gaveUpAt: new Date().toISOString() },
    });
  }

  /**
   * The only automatic credential wipe left. With the Chromium-era cleanup
   * retired, every other unusable-credential case waits for the operator's
   * delete -- no heuristic decides on its own that credentials are bad.
   */
  private async markLoggedOut(sessionId: string): Promise<void> {
    this.clearRetry(sessionId);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'disconnected';
      session.qrCode = undefined;
      session.lastSeen = new Date();
      session.metadata = { ...(session.metadata ?? {}), authInvalidated: true };
    }

    await this.deps.store.clear(sessionId);
    await this.deps.updateSessionStatus(sessionId, 'disconnected', {
      lastError: 'WhatsApp logged this session out (401)',
      metadata: { authInvalidated: true, autoReconnect: false },
    });
    await this.deps.publisher.sendWebhook({
      event: 'disconnected',
      sessionId,
      data: { reason: 'logged_out', disconnectType: 'WHATSAPP_LOGGED_OUT' },
      timestamp: new Date().toISOString(),
    });
  }

  private clearRetry(sessionId: string): void {
    const timer = this.retryTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(sessionId);
    }
  }
}

export default BaileysSessionManager;
