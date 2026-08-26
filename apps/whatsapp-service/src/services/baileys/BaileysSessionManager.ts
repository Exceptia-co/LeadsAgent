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

/** The only two JID domains Baileys addresses; @c.us is whatsapp-web.js's. */
const BAILEYS_DOMAIN = /@(s\.whatsapp\.net|g\.us)$/;

function toJid(to: string): string {
  // Callers still pass the legacy @c.us suffix -- the path this replaces
  // stripped it explicitly (MessageHandler.normalizePhoneNumber). Baileys does
  // not use that domain, so passing it through fails the send and returns
  // { success: false } with nothing explaining why.
  const bare = to.replace(/@c\.us$/, '');
  return BAILEYS_DOMAIN.test(bare) ? bare : `${bare.replace(/\D/g, '')}@s.whatsapp.net`;
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
    // A second create would overwrite the runtime and orphan the live socket
    // with its three listeners still subscribed under handler identities
    // `detach` can no longer reach: every inbound message delivered twice, and
    // the orphan's eventual close tearing down the socket that replaced it.
    // WhatsAppServiceSimple's `clients.has` check is what prevents this today,
    // and Task 8a deletes that map -- so the guard lives here now.
    if (this.sockets.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }
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
      // A 515 arriving while a backoff timer is pending would otherwise leave
      // that timer to fire a second rebuild and churn the socket that just
      // came up. `attempts` is deliberately not reset: 515 is not evidence the
      // connection is healthy.
      this.clearRetry(sessionId);
      this.rebuild(sessionId);
      return;
    }

    // connectionLost and timedOut are both 408 and cannot be told apart, so
    // nothing tries: 401 is the only code that means the credentials are dead.
    const loggedOut = code === DisconnectReason.loggedOut;

    // Injected so the persisted row and its reconnectCount keep being
    // maintained the way they are today. The reconnect must survive a
    // bookkeeping failure: an unguarded rejection here skips the stopped
    // re-check, the logout wipe and the retry, leaving the session at
    // 'connecting' with no socket and no timer, forever. It is latent only
    // because the injected implementation happens to swallow its own errors --
    // a property no type expresses and nothing enforces.
    try {
      // 'NETWORK_ERROR', not 'WHATSAPP_DISCONNECT'. The switch on the other
      // side of this call has no case for the latter, so it falls to
      // `default`, which persists `metadata.autoReconnect: false` -- and
      // RecoveryRunner refuses to recover a session carrying that flag. A
      // transient blip would therefore bar its own session from recovery
      // forever if the process restarted before the in-memory retry landed:
      // the Phase 1 latch, arriving by a new road.
      //
      // The old engine avoided it by classifying the drop; Baileys collapses
      // every non-401 close into one event and 408 covers both connectionLost
      // and timedOut, so classifying by code is not available. It does not
      // need to be: this manager already knows whether it intends to retry. A
      // close that schedules one is by definition recoverable, which is what
      // NETWORK_ERROR means to that switch. The close that exhausts the budget
      // is the one that stops recovery, and markGaveUp writes
      // `autoReconnect: false` itself -- last write wins, since the metadata
      // column is replaced wholesale. The real close code still travels in
      // `originalReason`.
      await this.deps.handleSessionDisconnect(
        sessionId,
        loggedOut ? 'WHATSAPP_LOGGED_OUT' : 'NETWORK_ERROR',
        code ?? 'unknown'
      );
    } catch (error) {
      logger.error(`handleSessionDisconnect failed for session ${sessionId}:`, error);
    }

    // Every await between the close event and the schedule is a place where
    // the session can be destroyed underneath us. Check after the last one.
    if (this.stopped.has(sessionId)) return;

    if (loggedOut) {
      await this.markLoggedOut(sessionId);
      return;
    }

    // `reason` is not decoration: apps/api's handleSessionDisconnected writes it
    // straight into whatsapp_sessions.lastError -- the same row and column the
    // terminal paths below just wrote. One generic string for every arm would
    // therefore erase the specific explanation microseconds after persisting
    // it, leaving the operator "Connection closed (code 408)" where
    // "Reconnect budget exhausted after 5 attempts" was. So: whatever a branch
    // persisted is what its webhook carries.
    let reason = `Connection closed (code ${code ?? 'unknown'})`;
    let disconnectType = 'NETWORK_ERROR';

    if (code === DisconnectReason.connectionReplaced) {
      // 440 means another client has taken this session over -- usually the
      // user opening WhatsApp Web somewhere else. Retrying is not a
      // reconnect, it is a fight: we come back and kick them off, they come
      // back and kick us off, five times over. Every round is a real
      // disconnection for whoever legitimately took over.
      //
      // Terminal, but NOT markLoggedOut: the credentials are perfectly valid,
      // someone else is simply using them. Clearing the store here would turn
      // "you opened WhatsApp elsewhere" into "scan a new QR", which is worse
      // than the bug.
      logger.warn(
        `Session ${sessionId} was replaced by another WhatsApp client (440); not reconnecting`
      );
      reason = 'Session taken over by another WhatsApp client (440)';
      // Not NETWORK_ERROR: this is a terminal takeover, not a blip we intend
      // to retry. Nothing reads this field today, which is exactly why it has
      // to be right -- the first consumer will trust it.
      disconnectType = 'WHATSAPP_REPLACED';
      await this.markTerminal(sessionId, reason, { replacedAt: new Date().toISOString() });
    } else {
      // One disconnect can emit `close` twice: the socket emits it, and end()
      // emits it again during teardown. scheduleRetry already absorbs that by
      // re-arming the same rung instead of advancing it, and a pending timer
      // is the signal that this is the second one -- so the same fact keeps
      // the dashboard from getting two session:disconnected events for one
      // drop. A close that exhausts the budget is never a repeat (the rung
      // cannot advance while a timer is pending), but it is checked first
      // anyway so a terminal event can never be the one suppressed.
      const repeatClose = this.retryTimers.has(sessionId);
      const gaveUp = await this.scheduleRetry(sessionId, code);
      if (gaveUp) {
        reason = gaveUp;
      } else if (repeatClose) {
        return;
      }
    }

    // The outgoing engine's `client.on('disconnected')` fired on every drop,
    // so both consumers saw transient ones: apps/api recorded the drop, and
    // SocketService turned it into `session:disconnected`. Emitting only from
    // markLoggedOut would leave the dashboard showing a session as connected
    // for the whole time it is down and reconnecting. Same frozen payload
    // shape EventDispatcher used -- `data.reason` is the field both consumers
    // actually read.
    //
    // After scheduleRetry, not before: arming the reconnect is the recovery
    // and this is a notification, so the timer must not sit behind a network
    // call that waits up to five seconds before giving up. Guarded for the
    // same reason handleSessionDisconnect is.
    try {
      await this.deps.publisher.sendWebhook({
        event: 'disconnected',
        sessionId,
        data: { reason, disconnectType },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`disconnected webhook failed for session ${sessionId}:`, error);
    }
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

  /** Returns the persisted lastError if the budget ran out, else undefined. */
  private async scheduleRetry(sessionId: string, code?: number): Promise<string | undefined> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return undefined;

    // One disconnect can emit `close` twice -- the socket emits it, and end()
    // emits it again during teardown. Counting both burns two of the five
    // rungs and installs the 5 s delay where 2 s was due, so a second event
    // re-arms the same rung instead of advancing it.
    const attempt = this.retryTimers.has(sessionId) ? runtime.attempts : runtime.attempts + 1;
    if (attempt > RETRY_SCHEDULE_MS.length) {
      return await this.markGaveUp(sessionId, code);
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
    return undefined;
  }

  /** Returns the lastError it persisted, so the webhook can carry the same one. */
  private async markGaveUp(sessionId: string, code?: number): Promise<string> {
    logger.error(
      `Session ${sessionId} gave up after ${RETRY_SCHEDULE_MS.length} reconnect attempts (last code ${code ?? 'unknown'})`
    );
    const lastError = `Reconnect budget exhausted after ${RETRY_SCHEDULE_MS.length} attempts (last code ${code ?? 'unknown'})`;
    await this.markTerminal(sessionId, lastError, { gaveUpAt: new Date().toISOString() });
    return lastError;
  }

  /**
   * Stop trying, keep the credentials. The two callers -- an exhausted
   * reconnect budget and a 440 takeover -- differ only in what they put in
   * `lastError`, which is the operator's record of what happened.
   *
   * autoReconnect stays true. The flag means "may RecoveryRunner attempt this
   * session at boot", not "is a retry currently scheduled" -- and both
   * conditions are per-process by construction, so a fresh process tries once
   * more in an orderly way rather than looping. Writing false here would
   * condemn a healthy session to zombie state over a two-minute fibre cut or a
   * phone the user has since closed, recoverable only by hand: exactly the
   * failure in docs/deployment/post-shutdown-fix-recovery.md. After this,
   * false means one of exactly two deliberate things -- an operator paused the
   * session (forceDisconnect), or WhatsApp ended it (401).
   */
  private async markTerminal(
    sessionId: string,
    lastError: string,
    extra: Record<string, unknown>
  ): Promise<void> {
    this.closeTerminally(sessionId);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'disconnected';
      session.lastSeen = new Date();
    }

    await this.deps.updateSessionStatus(sessionId, 'disconnected', {
      lastError,
      metadata: { autoReconnect: true, ...extra },
    });
  }

  /**
   * The only automatic credential wipe left. With the Chromium-era cleanup
   * retired, every other unusable-credential case waits for the operator's
   * delete -- no heuristic decides on its own that credentials are bad.
   */
  private async markLoggedOut(sessionId: string): Promise<void> {
    // Unsubscribe before the wipe, same reason as destroySession: a
    // creds.update still in flight would land after store.clear and write
    // fresh rows for credentials WhatsApp has already invalidated.
    this.closeTerminally(sessionId);

    // 'auth_failure', not 'disconnected'. Four things record this event and
    // they must agree, or the operator cannot tell "needs a new QR" from
    // "dropped and coming back":
    //   1. handleSessionDisconnect('WHATSAPP_LOGGED_OUT') -> auth_failure
    //   2. this in-memory status, which is what the REST session route serves
    //   3. the updateSessionStatus below, which is the persisted row
    //   4. the webhook, which apps/api turns into its own status
    // Until this change, 2, 3 and 4 all overwrote 1 back to 'disconnected'.
    // Recovery was never affected -- metadata.authInvalidated is what the
    // runbook's latch reads -- but the status the dashboard shows was.
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'auth_failure';
      session.qrCode = undefined;
      session.lastSeen = new Date();
      session.metadata = { ...(session.metadata ?? {}), authInvalidated: true };
    }

    const lastError = 'WhatsApp logged this session out (401)';
    await this.deps.store.clear(sessionId);
    await this.deps.updateSessionStatus(sessionId, 'auth_failure', {
      lastError,
      metadata: { authInvalidated: true, autoReconnect: false },
    });
    await this.deps.publisher.sendWebhook({
      event: 'disconnected',
      sessionId,
      // authInvalidated is the field apps/api branches on
      // (whatsapp.service.ts: `data?.authInvalidated ? 'auth_failure' : 'disconnected'`).
      // Omitting it made the API record a credential death as an ordinary drop.
      // `reason` is the message worth persisting, not a machine token: apps/api
      // writes it into the same lastError this method just set, so 'logged_out'
      // overwrote the sentence with a word. Nothing branches on the value --
      // SocketService passes it through and the dashboard only logs it.
      data: { reason: lastError, disconnectType: 'WHATSAPP_LOGGED_OUT', authInvalidated: true },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Shared tail of the two paths that end a session without deleting it: the
   * 401 wipe and the exhausted retry budget. Both leave the row in `sessions`
   * so the dashboard still lists it, but the socket has to go.
   *
   * Left in the map it would keep three live listeners on a dead connection:
   * `sendMessage` would still find it, and a stray second `close` carrying a
   * non-401 code would re-enter onClose and rebuild using in-memory creds that
   * `store.clear` had already orphaned in the database.
   */
  private closeTerminally(sessionId: string): void {
    this.stopped.add(sessionId);
    this.clearRetry(sessionId);

    const sock = this.sockets.get(sessionId);
    if (!sock) return;

    this.detach(sessionId, sock);
    try {
      sock.end(undefined);
    } catch (error) {
      logger.warn(`Error ending socket for session ${sessionId}:`, error);
    }
    this.sockets.delete(sessionId);
  }

  private clearRetry(sessionId: string): void {
    const timer = this.retryTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(sessionId);
    }
  }
}
