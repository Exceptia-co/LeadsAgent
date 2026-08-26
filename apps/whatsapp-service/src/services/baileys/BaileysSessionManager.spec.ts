const mockMakeWASocket = jest.fn();
const mockMakeBaileysAuthState = jest.fn();
const mockMakeCacheableSignalKeyStore = jest.fn();

jest.mock('@whiskeysockets/baileys', () => {
  const actual = jest.requireActual('@whiskeysockets/baileys');
  return {
    ...actual,
    __esModule: true,
    default: (...args: unknown[]) => mockMakeWASocket(...args),
    makeWASocket: (...args: unknown[]) => mockMakeWASocket(...args),
    makeCacheableSignalKeyStore: (...args: unknown[]) =>
      mockMakeCacheableSignalKeyStore(...args),
  };
});

jest.mock('./BaileysAuthState', () => ({
  makeBaileysAuthState: (...args: unknown[]) => mockMakeBaileysAuthState(...args),
}));

const mockRedisGet = jest.fn();

jest.mock('../../config/redis', () => ({
  __esModule: true,
  redisClient: { get: (...args: unknown[]) => mockRedisGet(...args) },
  // The real prefix, from config/redis.ts. Inventing one here makes the mock
  // answer for a key the implementation never asks about, so the test passes
  // whatever the implementation actually reads.
  REDIS_KEYS: { SESSION_HEARTBEAT: 'session:hb:' },
  REDIS_TTL: {},
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { EventEmitter } from 'events';
import { DisconnectReason } from '@whiskeysockets/baileys';
import { BaileysSessionManager } from './BaileysSessionManager';

const SESSION_ID = 'smoke';

function makeFakeSocket() {
  const emitter = new EventEmitter();
  let offs = 0;
  return {
    // A real EventEmitter, not jest.fn(): the teardown test needs `off` to
    // genuinely unsubscribe so a later emit on the dead socket reaches
    // nothing. Counting the calls as well lets it assert all three went.
    ev: {
      on: (event: string, handler: (...a: any[]) => void) => emitter.on(event, handler),
      off: (event: string, handler: (...a: any[]) => void) => {
        offs++;
        return emitter.off(event, handler);
      },
    },
    offCount: () => offs,
    // end() emits close, the way the real socket does. Without this the fake
    // hides the ordering bug outright: an implementation that clears the
    // retry timer and *then* calls end() -- with the listeners still
    // subscribed -- schedules a fresh retry from inside its own shutdown, and
    // a silent end() would let that pass. This is the Phase 1 failure mode
    // wearing new clothes: the deploy restarts, and the process reconnects on
    // its way out.
    emit: (event: string, payload: unknown) => emitter.emit(event, payload),
    user: { id: '34600111222:12@s.whatsapp.net' },
    sendMessage: jest.fn().mockResolvedValue({ key: { id: 'OUT1' } }),
    sendPresenceUpdate: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    end: jest.fn(function (this: void) {
      emitter.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionClosed } } },
      });
    }),
  };
}

let sock: ReturnType<typeof makeFakeSocket>;
let store: any;
let publisher: any;
let sessionStatus: jest.Mock;
let pipeline: any;

beforeEach(() => {
  jest.clearAllMocks();
  sock = makeFakeSocket();
  mockMakeWASocket.mockReturnValue(sock);
  mockMakeBaileysAuthState.mockResolvedValue({
    state: { creds: {}, keys: { get: jest.fn(), set: jest.fn() } },
    saveCreds: jest.fn().mockResolvedValue(undefined),
  });
  // Each call returns a distinct wrapper, mirroring the real function's
  // per-call cache.
  mockMakeCacheableSignalKeyStore.mockImplementation((keys: unknown) => ({ wrapped: keys }));
  mockRedisGet.mockResolvedValue(null);
  store = { hasCredentials: jest.fn().mockResolvedValue(false), clear: jest.fn() };
  publisher = { sendWebhook: jest.fn().mockResolvedValue(undefined) };
  sessionStatus = jest.fn().mockResolvedValue(undefined);
  pipeline = { handle: jest.fn().mockResolvedValue(undefined) };
});

let sessionDisconnect: jest.Mock;

function makeManager() {
  sessionDisconnect = jest.fn().mockResolvedValue(undefined);
  return new BaileysSessionManager({
    store,
    publisher,
    pipeline,
    updateSessionStatus: sessionStatus,
    handleSessionDisconnect: sessionDisconnect,
    // Deterministic jitter. The production default is Math.random; pinning it
    // to 0 here is what lets the backoff test advance to an exact
    // millisecond. Without the injection, "2 s with jitter" and
    // advanceTimersByTime(2000) contradict each other and the test is either
    // flaky or meaningless.
    jitter: () => 0,
  });
}

describe('BaileysSessionManager construction', () => {
  it('opens_no_socket_until_createSession_is_called', async () => {
    // Task 7 lands this class in main while whatsapp-web.js is still serving
    // production. A makeWASocket at module scope, or in the constructor,
    // would connect to WhatsApp the moment anything imports the file --
    // turning "compiled but unreachable" into a second live engine.
    makeManager();

    expect(mockMakeWASocket).not.toHaveBeenCalled();
    expect(mockMakeBaileysAuthState).not.toHaveBeenCalled();
  });

  it('wraps_every_session_in_its_own_cacheable_key_store', async () => {
    // makeCacheableSignalKeyStore builds a fresh cache per call when no cache
    // is passed. Hoisting the call to module scope -- the obvious way to
    // "avoid rebuilding it" -- would share one cache across every session and
    // cross two tenants' Signal keys in memory.
    //
    // Comparing the two `auth.keys` for inequality is not enough: passing
    // `{ ...state.keys }` gives two distinct objects without calling the
    // wrapper at all. The mock is what proves the wrapper ran.
    const manager = makeManager();
    await manager.createSession('tenant-a');
    await manager.createSession('tenant-b');

    expect(mockMakeCacheableSignalKeyStore).toHaveBeenCalledTimes(2);
    // No shared cache argument -- the third parameter must stay unset so each
    // call builds its own.
    expect(mockMakeCacheableSignalKeyStore.mock.calls[0][2]).toBeUndefined();
    const keysA = mockMakeWASocket.mock.calls[0][0].auth.keys;
    const keysB = mockMakeWASocket.mock.calls[1][0].auth.keys;
    expect(keysA).not.toBe(keysB);
  });

  it('passes_the_configuration_the_cutover_depends_on', async () => {
    // syncFullHistory would replay old conversations through the AI and
    // answer them; printQRInTerminal would dump QR codes into production
    // logs. Neither has a test anywhere else.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    expect(mockMakeWASocket.mock.calls[0][0]).toMatchObject({
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
  });

  it('returns_the_provider_message_id_from_an_outbound_send', async () => {
    // WhatsAppServiceSimple.sendMessage's response shape is a published REST
    // contract that the dashboard reads. A send that works but returns no
    // messageId breaks the caller without failing anything here otherwise.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    const result = await manager.sendMessage(SESSION_ID, '34600111222', 'hola');

    expect(sock.sendMessage).toHaveBeenCalledWith('34600111222@s.whatsapp.net', { text: 'hola' });
    expect(result).toMatchObject({ success: true, messageId: 'OUT1' });
  });

  it('strips_the_wwebjs_suffix_the_send_routes_append', async () => {
    // Not a legacy possibility -- routes/index.ts:381 (send in conversation)
    // and :774 (proactive send) both build `${phone}@c.us` unconditionally and
    // hand it to sendMessage. @c.us is whatsapp-web.js's user domain; Baileys
    // does not use it. Passing the `@` straight through would give Baileys a
    // domain it cannot address and fail 100% of outbound traffic with
    // { success: false } and no diagnostic -- while every inbound test in this
    // file, and a smoke test that only checks inbound, stayed green.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    for (const to of ['34600111222@c.us', '34600111222']) {
      await manager.sendMessage(SESSION_ID, to, 'hola');
      expect(sock.sendMessage).toHaveBeenLastCalledWith('34600111222@s.whatsapp.net', {
        text: 'hola',
      });
    }

    // The two domains Baileys does address are left alone -- rewriting a group
    // JID into a user JID would send the message to the wrong chat entirely.
    for (const jid of ['120363000000000000@g.us', '34600111222@s.whatsapp.net']) {
      await manager.sendMessage(SESSION_ID, jid, 'hola');
      expect(sock.sendMessage).toHaveBeenLastCalledWith(jid, { text: 'hola' });
    }
  });

  it('refuses_a_second_createSession_for_a_live_session', async () => {
    // Overwriting the runtime orphans the live socket with its three listeners
    // still subscribed under handler identities detach can no longer reach:
    // every inbound message delivered twice, and the orphan's eventual close
    // tearing down the socket that replaced it. WhatsAppServiceSimple's
    // `clients.has` check is what prevents this today and Task 8a deletes that
    // map, so the guard has to live in the manager.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    await expect(manager.createSession(SESSION_ID)).rejects.toThrow(
      `Session ${SESSION_ID} already exists`
    );
    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    expect(mockMakeBaileysAuthState).toHaveBeenCalledTimes(1);
  });
});

describe('BaileysSessionManager connection lifecycle', () => {
  it('emits_exactly_two_authenticated_webhooks_per_successful_pairing', async () => {
    // Phase 1 froze this: EventDispatcher emitted one from `authenticated`
    // with the number unknown, and one from `ready` with the real number.
    // SocketService turns each into session:connected. Baileys collapses both
    // sources into connection.update, so emitting one would drop a dashboard
    // notification and emitting three would duplicate it.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    // Three creds.update events, not one. Baileys emits this repeatedly
    // during a single handshake -- keys rotate, myAppStateKeyId arrives, the
    // account record fills in. An implementation that emits `authenticated`
    // on every creds.update satisfies a test that fires the event once, and
    // then floods the dashboard with session:connected in production.
    sock.emit('creds.update', {});
    sock.emit('creds.update', { myAppStateKeyId: 'AAAA' });
    sock.emit('creds.update', { account: {} });
    await Promise.resolve();

    // Check the split, not just the total. Emitting both from `open` also
    // yields two -- and loses the "credentials exist" signal the dashboard
    // uses to stop showing the QR while the connection finishes coming up.
    const authAfterCreds = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((p: any) => p.event === 'authenticated');
    expect(authAfterCreds).toHaveLength(1);
    expect(authAfterCreds[0].data.number).toBe('unknown');

    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    const authEvents = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((p: any) => p.event === 'authenticated');
    expect(authEvents).toHaveLength(2);
    expect(authEvents[1].data.number).toBe('34600111222');
  });

  it('does_not_emit_a_third_authenticated_when_the_connection_reopens', async () => {
    // The mirror case. `open` fires again after every reconnect, and Phase 1's
    // contract is two per session lifecycle -- not two per connection.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('creds.update', {});
    sock.emit('connection.update', { connection: 'open' });
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    const authEvents = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((p: any) => p.event === 'authenticated');
    expect(authEvents).toHaveLength(2);
  });

  it('announces_a_recovered_connection_so_the_dashboard_can_leave_DISCONNECTED', async () => {
    // The mirror of the test above, and the reason it cannot simply stay
    // silent. onClose publishes `disconnected` on every transient close --
    // SocketService turns that into session:disconnected, and useSocket writes
    // DISCONNECTED into React state that only session:connected,
    // session:status_changed or a page reload clears. Announcing the drop and
    // not the recovery leaves a session that came back five seconds later
    // showing as down until someone reloads the page.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    sock.emit('creds.update', {});
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();
    publisher.sendWebhook.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await jest.advanceTimersByTimeAsync(2000);
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    const events = publisher.sendWebhook.mock.calls.map((c: any[]) => c[0]);
    expect(events.filter((p: any) => p.event === 'disconnected')).toHaveLength(1);
    // Still no third `authenticated`: Phase 1 froze two per session lifetime,
    // so the recovery has to travel as something else.
    expect(events.filter((p: any) => p.event === 'authenticated')).toHaveLength(0);

    // `status_change` needs no new contract -- SocketService and apps/api's
    // handleStatusChange both already handle it. The status string is
    // load-bearing: SocketService.mapStatusToFrontend turns 'ready' into
    // CONNECTED, and anything it does not recognise becomes QR_PENDING.
    const recovery = events.filter((p: any) => p.event === 'status_change');
    expect(recovery).toHaveLength(1);
    expect(recovery[0]).toMatchObject({
      sessionId: SESSION_ID,
      data: { status: 'ready', number: '34600111222' },
    });
    expect(typeof recovery[0].timestamp).toBe('string');

    jest.useRealTimers();
  });

  it('treats_restartRequired_as_a_reconnect_and_not_as_a_failure', async () => {
    // 515 fires on the first pairing and is a normal step. Treating it as a
    // disconnect is the classic Baileys integration bug: the session pairs,
    // instantly "fails", and never comes up.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
    });
    // Fast, but never instant. Both sides of the floor: a bare rebuild() in
    // this branch passes any "reconnects eventually" assertion while removing
    // the only throttle on the path -- and 515 is the code a session that
    // cannot persist its credentials repeats forever.
    await jest.advanceTimersByTimeAsync(999);
    expect(mockMakeWASocket).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(store.clear).not.toHaveBeenCalled();
    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('caps_consecutive_515s_and_ends_the_session_with_its_own_lastError', async () => {
    // The failure this guards is not a slow pairing, it is a hot loop: a 515
    // that repeats -- the documented outcome of credentials that never
    // persist, and saveCreds rejections are swallowed into a log line by the
    // handler guard -- would otherwise rebuild forever, one second apart,
    // against WhatsApp on a client's personal number, reporting nothing.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    const restart = () =>
      sock.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
      });

    for (let i = 1; i <= 3; i++) {
      restart();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockMakeWASocket).toHaveBeenCalledTimes(i);
    }
    // Three fast rebuilds and not one word upstream -- that is the deal, and
    // it only holds while the budget lasts.
    expect(sessionDisconnect).not.toHaveBeenCalled();

    restart();
    await jest.advanceTimersByTimeAsync(120000);
    // No fourth socket, and none appearing later on any rung: the fourth
    // consecutive 515 is terminal, not a slower retry. Advancing well past the
    // whole backoff schedule is what separates the two.
    expect(mockMakeWASocket).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
    // And it is reported: the persisted row, its own explanation, and the
    // webhook carrying the same one. A generic "reconnect budget exhausted"
    // here would tell the operator the network dropped, when what actually
    // happened is that the handshake never completed -- usually because the
    // credentials are not being persisted.
    expect(sessionDisconnect).toHaveBeenCalledWith(SESSION_ID, 'NETWORK_ERROR', 515);
    const terminal = sessionStatus.mock.calls.filter((c: any[]) => c[2]?.metadata?.restartLoopAt);
    expect(terminal).toHaveLength(1);
    expect(terminal[0][1]).toBe('disconnected');
    expect(terminal[0][2].lastError).toContain('515');
    expect(terminal[0][2].lastError).not.toContain('Reconnect budget');
    const published = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((p: any) => p.event === 'disconnected')
      .pop();
    // apps/api writes data.reason straight into the same lastError column.
    expect(published.data.reason).toBe(terminal[0][2].lastError);
    expect(published.data.disconnectType).toBe('WHATSAPP_RESTART_LOOP');
    // Credentials survive: a session that cannot finish a handshake is not a
    // session WhatsApp has logged out, and clearing them would turn a
    // recoverable fault into "scan a new QR".
    expect(store.clear).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('counts_only_consecutive_515s_so_a_successful_connection_clears_the_budget', async () => {
    // One 515 is what first pairing looks like. Without the reset, that single
    // ordinary restart is banked forever: a session that pairs, runs for a
    // month and then meets two unrelated 515s gives up on the third for a
    // reason that has nothing to do with it.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    const restart = () =>
      sock.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
      });

    restart();
    await jest.advanceTimersByTimeAsync(1000);
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    // Three more, all of which must still reconnect on the fast path.
    for (let i = 2; i <= 4; i++) {
      restart();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockMakeWASocket).toHaveBeenCalledTimes(i);
    }
    expect(sessionStatus.mock.calls.filter((c: any[]) => c[2]?.metadata?.restartLoopAt)).toHaveLength(
      0
    );

    jest.useRealTimers();
  });

  it('does_not_reconnect_instantly_when_a_close_lands_on_a_rung_the_515_path_armed', async () => {
    // The 515 path arms the shared retry timer without spending a backoff rung.
    // scheduleRetry reads a pending timer as "this is the second close of one
    // disconnect" and reuses the current rung -- which is rung 0 here, so
    // RETRY_SCHEDULE_MS[-1] is undefined, the delay is NaN, and setTimeout(NaN)
    // fires on the next tick. That is an unthrottled reconnect reached without
    // a single line looking wrong, and nothing else in this file catches it:
    // remove `&& runtime.attempts > 0` from scheduleRetry and all other tests
    // stay green.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
    });
    await Promise.resolve();
    // Before the 1 s rebuild fires, an ordinary close arrives.
    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });

    // t=0 is the assertion that matters: a NaN delay lands here.
    await jest.advanceTimersByTimeAsync(0);
    expect(mockMakeWASocket).not.toHaveBeenCalled();
    // And it took the first real rung, not a shorter one.
    await jest.advanceTimersByTimeAsync(1999);
    expect(mockMakeWASocket).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('backs_off_between_reconnects_and_gives_up_after_five', async () => {
    // Baileys does not reconnect on its own. A close handler that calls
    // createSession() directly is an unthrottled loop against WhatsApp's
    // servers -- deleting the delay is a one-line change, and the cost of it
    // is the exact risk this migration was approved on the promise of not
    // making worse.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    const close = () =>
      sock.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
      });

    // Assert on both sides of every rung. Advancing straight to the total
    // would pass for any shorter delay -- including zero -- which is exactly
    // the regression the schedule exists to prevent.
    let expected = 0;
    for (const rung of [2000, 5000, 10000, 30000, 60000]) {
      close();
      await jest.advanceTimersByTimeAsync(rung - 1);
      expect(mockMakeWASocket).toHaveBeenCalledTimes(expected);   // not yet
      await jest.advanceTimersByTimeAsync(1);
      expect(mockMakeWASocket).toHaveBeenCalledTimes(++expected); // now
    }

    // Sixth close: the five-attempt budget is spent, the session gives up.
    close();
    await jest.advanceTimersByTimeAsync(120000);
    expect(mockMakeWASocket).toHaveBeenCalledTimes(5);
    expect(sessionStatus).toHaveBeenCalledWith(SESSION_ID, 'disconnected', expect.anything());

    jest.useRealTimers();
  });

  it('schedules_only_one_retry_when_close_fires_twice_for_one_disconnect', async () => {
    // A single disconnect can emit connection:'close' more than once -- the
    // socket emits it, and end() during teardown emits it again. Scheduling
    // per event instead of per session leaves two timers racing to rebuild
    // the same session, which ends with two live sockets and every inbound
    // message delivered twice.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    const close = () =>
      sock.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
      });
    close();
    close();

    // The rung, not only the count. Advancing straight to 10 000 ms covers the
    // 5 000 ms rung too, so counting one socket also passes when the second
    // close burned a second attempt and installed the wrong delay -- halving
    // the five-attempt budget for one disconnect.
    await jest.advanceTimersByTimeAsync(1999);
    expect(mockMakeWASocket).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);

    // And no second timer racing behind it.
    await jest.advanceTimersByTimeAsync(10000);
    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('still_schedules_the_retry_when_the_disconnect_bookkeeping_fails', async () => {
    // handleSessionDisconnect is a database write. An unguarded rejection
    // aborts onClose before the stopped re-check and scheduleRetry, and the
    // session sits at 'connecting' with no socket and no timer -- a zombie
    // nothing recovers but a process restart. It is latent only because the
    // injected implementation happens to swallow its own errors, which no type
    // expresses and nothing enforces. The only witness is the timer that was
    // never created.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();
    sessionDisconnect.mockRejectedValue(new Error('db timeout'));

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await Promise.resolve();

    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('keeps_the_retry_timers_of_two_sessions_independent', async () => {
    // The test above is also satisfied by a single global timer -- which
    // would mean two sessions dropping together produce one reconnect and one
    // session left dead. The Map has to be keyed by session.
    jest.useFakeTimers();
    const sockA = makeFakeSocket();
    const sockB = makeFakeSocket();
    mockMakeWASocket.mockReturnValueOnce(sockA).mockReturnValueOnce(sockB);
    const manager = makeManager();
    await manager.createSession('a');
    await manager.createSession('b');
    mockMakeWASocket.mockClear();

    const drop = (s: ReturnType<typeof makeFakeSocket>) =>
      s.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
      });
    drop(sockA);
    drop(sockB);
    await jest.advanceTimersByTimeAsync(2000);

    expect(mockMakeWASocket).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('tears_the_old_socket_down_before_building_the_new_one', async () => {
    // Nothing else in this file fails if the old listeners stay subscribed:
    // the reconnect works, the tests pass, and production quietly delivers
    // every inbound message twice under two socket objects. Redis dedupe
    // masks it for 300 seconds, so it survives the smoke and shows up later
    // as duplicate replies.
    jest.useFakeTimers();
    const next = makeFakeSocket();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    // Snapshot the old socket's teardown state at the instant the new socket
    // is requested. This is what makes the test about ordering rather than
    // about totals.
    let teardownStateAtCreate: { offs: number; ended: boolean } | null = null;
    mockMakeWASocket.mockClear().mockImplementation(() => {
      teardownStateAtCreate = { offs: sock.offCount(), ended: sock.end.mock.calls.length > 0 };
      return next;
    });

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await jest.advanceTimersByTimeAsync(2000);

    // Order, not just outcome. Building the new socket first and tearing the
    // old one down afterwards satisfies every count below, so the assertion
    // that matters is captured at the moment makeWASocket is called.
    expect(sock.end).toHaveBeenCalledTimes(1);
    expect(sock.offCount()).toBe(3);
    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    expect(teardownStateAtCreate).toEqual({ offs: 3, ended: true });

    // And it is inert: an event from the dead socket reaches nothing.
    pipeline.handle.mockClear();
    sock.emit('messages.upsert', {
      type: 'notify',
      messages: [
        { key: { remoteJid: '34600111222@s.whatsapp.net', id: 'GHOST' }, message: { conversation: 'x' } },
      ],
    });
    await Promise.resolve();
    expect(pipeline.handle).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('resets_the_backoff_budget_after_a_successful_connection', async () => {
    // Without the reset, a session that reconnects fine five times over a
    // month is permanently out of retries on the sixth blip -- and nothing
    // logs why.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await jest.advanceTimersByTimeAsync(2000);
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    // Back to the first rung, not the second.
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockMakeWASocket).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('clears_the_credentials_only_on_loggedOut', async () => {
    // 401 is the one code that means the credentials are dead. Every other
    // code is a reconnect -- and connectionLost and timedOut are both 408, so
    // any branch trying to tell those two apart is wrong by construction.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await Promise.resolve();
    expect(store.clear).not.toHaveBeenCalled();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    await Promise.resolve();
    expect(store.clear).toHaveBeenCalledWith(SESSION_ID);

    // And the dead socket is out of the map. No return value and no mock call
    // witnesses this -- the harm is a resource left alive: three listeners on
    // a dead connection, and a stray second close rebuilding on in-memory
    // creds that store.clear just orphaned in the database. sendMessage is the
    // one observable that can see the socket is gone.
    expect(await manager.sendMessage(SESSION_ID, '34600111222', 'x')).toMatchObject({
      success: false,
    });
  });

  it('publishes_the_qr_and_caches_it_on_the_session_row', async () => {
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('connection.update', { qr: 'QR-PAYLOAD' });
    await Promise.resolve();

    // The full payload, not objectContaining: a webhook carrying the right
    // QR under the wrong sessionId routes a working pairing code to another
    // tenant's dashboard, and objectContaining would let it through.
    expect(sessionStatus).toHaveBeenCalledWith(SESSION_ID, 'connecting', { qrCode: 'QR-PAYLOAD' });
    expect(publisher.sendWebhook).toHaveBeenCalledTimes(1);
    const sent = publisher.sendWebhook.mock.calls[0][0];
    expect(sent.event).toBe('qr_updated');
    expect(sent.sessionId).toBe(SESSION_ID);
    expect(sent.data).toStrictEqual({ qrCode: 'QR-PAYLOAD' });
  });
});

describe('BaileysSessionManager observable state', () => {
  it('moves_the_session_through_the_states_the_dashboard_reads', async () => {
    // Without this, a manager whose createSession returns {} and never
    // updates anything passes every other test in this file. The dashboard
    // reads these values; "compiles and emits webhooks" is not the contract.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    expect(manager.getSession(SESSION_ID)!.status).toBe('connecting');

    sock.emit('connection.update', { qr: 'QR-PAYLOAD' });
    await Promise.resolve();
    expect(manager.getSession(SESSION_ID)!.qrCode).toBe('QR-PAYLOAD');

    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();
    expect(manager.getSession(SESSION_ID)!.status).toBe('ready');
    expect(manager.getSession(SESSION_ID)!.connectedNumber).toBe('34600111222');
    expect(manager.isSessionReady(SESSION_ID)).toBe(true);
  });

  it('leaves_ready_as_soon_as_the_connection_drops', async () => {
    // Covering only the happy path lets a manager that never downgrades the
    // status pass: it reports ready forever, the dashboard shows a green
    // session that answers nothing, and every other test still passes.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await Promise.resolve();
    // Retry pending: connecting, not ready and not disconnected.
    expect(manager.getSession(SESSION_ID)!.status).toBe('connecting');
    expect(manager.isSessionReady(SESSION_ID)).toBe(false);

    jest.useRealTimers();
  });

  it('lands_on_disconnected_when_the_budget_runs_out_and_auth_failure_when_logged_out', async () => {
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    const close = (code: number) =>
      sock.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: code } } },
      });

    for (const rung of [2000, 5000, 10000, 30000, 60000]) {
      close(DisconnectReason.connectionLost);
      await jest.advanceTimersByTimeAsync(rung);
    }
    close(DisconnectReason.connectionLost);
    await jest.advanceTimersByTimeAsync(120000);
    expect(manager.getSession(SESSION_ID)!.status).toBe('disconnected');

    jest.clearAllMocks();
    const other = makeManager();
    await other.createSession('logged-out');
    close(DisconnectReason.loggedOut);
    await Promise.resolve();
    // 'auth_failure', not 'disconnected'. This is the in-memory status the
    // REST session route serves, and it is what tells the operator a new QR is
    // needed rather than that the session is coming back on its own. The two
    // outcomes must stay distinguishable: a 401 and an exhausted budget both
    // end the session, and only one of them can be waited out.
    expect(other.getSession('logged-out')!.status).toBe('auth_failure');

    jest.useRealTimers();
  });

  it('records_a_401_as_auth_failure_everywhere_it_is_written', async () => {
    // Three writers record a 401 and they used to contradict each other:
    // handleSessionDisconnect mapped it to auth_failure, then markLoggedOut's
    // own status write and its webhook both said 'disconnected' -- the second
    // because apps/api branches on data.authInvalidated and the payload did
    // not carry it. Recovery was unaffected (metadata.authInvalidated is the
    // latch), but the status the dashboard shows was wrong, which is the whole
    // signal an operator uses to decide whether to go and scan a QR.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    await jest.advanceTimersByTimeAsync(0);

    // The persisted row. Filtering by the lastError rather than taking the
    // last call keeps this from passing on some unrelated write.
    const logout = sessionStatus.mock.calls.filter((c: any[]) => c[2]?.metadata?.authInvalidated);
    expect(logout).toHaveLength(1);
    expect(logout[0][1]).toBe('auth_failure');

    // The webhook apps/api consumes. Without authInvalidated it falls to the
    // 'disconnected' arm of `data?.authInvalidated ? … : …` and the API's copy
    // of the session contradicts ours.
    const disconnects = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((pl: any) => pl.event === 'disconnected');
    expect(disconnects).toHaveLength(1);
    expect(disconnects[0].data).toMatchObject({
      disconnectType: 'WHATSAPP_LOGGED_OUT',
      authInvalidated: true,
    });
    // apps/api writes data.reason into whatsapp_sessions.lastError -- the same
    // column this method just set. Sending anything else (it used to send the
    // token 'logged_out') overwrites the explanation with something less
    // useful a moment after persisting it.
    expect(disconnects[0].data.reason).toBe(logout[0][2].lastError);
    expect(disconnects[0].data.reason).toContain('401');
  });

  it('stops_without_wiping_credentials_when_another_client_takes_over', async () => {
    // 440 is a takeover, not a failure. Retrying it is a fight the user loses
    // either way: five rounds of kicking each other off. But it must not reach
    // markLoggedOut either -- the credentials are valid, so clearing them
    // would turn "you opened WhatsApp Web elsewhere" into "scan a new QR".
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionReplaced } } },
    });
    await jest.advanceTimersByTimeAsync(0);

    // No retry armed, and none appearing later: the timer is the only witness,
    // since a manager that scheduled one looks identical until it fires.
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(120000);
    expect(mockMakeWASocket).not.toHaveBeenCalled();

    expect(store.clear).not.toHaveBeenCalled();
    const replaced = sessionStatus.mock.calls.filter((c: any[]) => c[2]?.metadata?.replacedAt);
    expect(replaced).toHaveLength(1);
    expect(replaced[0][1]).toBe('disconnected');
    // Recoverable on a later boot, once the other client has gone.
    expect(replaced[0][2].metadata.autoReconnect).toBe(true);
    expect(replaced[0][2].lastError).toContain('taken over');

    const takeover = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((pl: any) => pl.event === 'disconnected')
      .pop();
    // Same rule as the other terminal path: apps/api persists data.reason over
    // the lastError asserted just above.
    expect(takeover.data.reason).toBe(replaced[0][2].lastError);
    // Not NETWORK_ERROR -- a terminal takeover is not a blip we mean to retry.
    expect(takeover.data.disconnectType).toBe('WHATSAPP_REPLACED');

    jest.useRealTimers();
  });

  it('publishes_one_disconnected_webhook_on_a_transient_close', async () => {
    // The engine this replaces used client.on('disconnected'), so every drop
    // reached both consumers. Emitting only from markLoggedOut means a
    // transient close publishes nothing: apps/api never records the drop, and
    // SocketService never emits session:disconnected -- so the dashboard shows
    // the session as connected for the entire time it is down and
    // reconnecting.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    publisher.sendWebhook.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await jest.advanceTimersByTimeAsync(0);

    const disconnects = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((p: any) => p.event === 'disconnected');
    // Exactly one: markLoggedOut publishes its own, so a close that reached
    // both paths would double-report.
    expect(disconnects).toHaveLength(1);
    // `data.reason` specifically -- SocketService.processWebhookEvent passes
    // `payload.data.reason` to emitSessionDisconnected and apps/api stores it
    // as lastError. A payload carrying the code under any other key satisfies
    // a shape check and gives both consumers undefined.
    expect(disconnects[0]).toMatchObject({
      event: 'disconnected',
      sessionId: SESSION_ID,
      data: { reason: expect.stringContaining('408'), disconnectType: 'NETWORK_ERROR' },
    });
    expect(typeof disconnects[0].timestamp).toBe('string');

    // A single disconnect emits close twice -- the socket emits it, and end()
    // emits it again during teardown. scheduleRetry already re-arms the same
    // rung rather than advancing it; without the matching suppression here the
    // dashboard gets two session:disconnected events for one drop.
    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(
      publisher.sendWebhook.mock.calls
        .map((c: any[]) => c[0])
        .filter((pl: any) => pl.event === 'disconnected')
    ).toHaveLength(1);
    // The suppression must not have cost the retry: still exactly one timer,
    // re-armed rather than doubled.
    expect(jest.getTimerCount()).toBe(1);

    jest.useRealTimers();
  });

  it('a_transient_close_does_not_bar_the_session_from_recovery', async () => {
    // SessionManager.handleSessionDisconnect has no case for
    // 'WHATSAPP_DISCONNECT'; it falls to `default`, which writes
    // metadata.autoReconnect:false -- and RecoveryRunner refuses to recover a
    // session carrying that flag. So the string this manager reports decides
    // whether a session survives a network blip across a restart. Asserting it
    // here rather than in SessionManager's spec is deliberate: the mapping is
    // already covered there, and what nothing else pins is which string this
    // side sends.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await Promise.resolve();

    // 'NETWORK_ERROR' is the only string in that switch that both maps to
    // shouldAutoReconnect:true and leaves authInvalidated false.
    expect(sessionDisconnect.mock.calls[0][1]).toBe('NETWORK_ERROR');

    jest.useRealTimers();
  });

  it('an_exhausted_budget_still_leaves_the_session_recoverable', async () => {
    // The other half of the pair, and the one that is counter-intuitive.
    // Spending the budget means a problem persisted for about two minutes; it
    // is not evidence the session should never be tried again. The flag means
    // "may RecoveryRunner attempt this at boot", the budget is per-process, so
    // writing false here condemns a healthy session to zombie state over a
    // temporary fibre cut -- recoverable only by database surgery. That is the
    // failure documented in post-shutdown-fix-recovery.md, and it is one of
    // the two Phase 1 latches, so it should never be settable by accident.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    const close = () =>
      sock.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
      });

    for (const rung of [2000, 5000, 10000, 30000, 60000]) {
      close();
      await jest.advanceTimersByTimeAsync(rung);
    }
    close();
    await jest.advanceTimersByTimeAsync(120000);

    // Keyed on gaveUpAt, not on the flag itself: filtering by
    // `autoReconnect === true` would find the transient writes as well and
    // pass for an implementation that latches at the end.
    const gaveUp = sessionStatus.mock.calls.filter((c: any[]) => c[2]?.metadata?.gaveUpAt);
    expect(gaveUp).toHaveLength(1);
    expect(gaveUp[0][1]).toBe('disconnected');
    expect(gaveUp[0][2].metadata.autoReconnect).toBe(true);
    // The operator's only record of what happened, and what the dashboard
    // surfaces -- the flag no longer carries that signal.
    expect(gaveUp[0][2].lastError).toContain('Reconnect budget exhausted');

    // ...and it has to survive the webhook that follows it. apps/api writes
    // data.reason into this very column, so a generic string here erases the
    // line above microseconds after it lands.
    const lastDisconnect = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((pl: any) => pl.event === 'disconnected')
      .pop();
    expect(lastDisconnect.data.reason).toBe(gaveUp[0][2].lastError);

    jest.useRealTimers();
  });

  it('reports_health_in_the_shape_the_rest_route_already_publishes', async () => {
    // { status, hasLocalAuth, heartbeatAge?, authInvalidated? } is a
    // published response body. Returning { hasCredentials, connected }
    // instead compiles and breaks the consumer silently.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    store.hasCredentials.mockResolvedValue(true);

    // Set up both optional fields so omitting them cannot pass. An
    // implementation returning only { status, hasLocalAuth } satisfies a
    // shape check that treats the other two as optional -- and the dashboard
    // loses its staleness indicator with nothing failing.
    mockRedisGet.mockResolvedValue(String(Date.now() - 45_000));
    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    await Promise.resolve();

    const health = await manager.getSessionHealth(SESSION_ID);

    expect(health.hasLocalAuth).toBe(true);
    expect(store.hasCredentials).toHaveBeenCalledWith(SESSION_ID);
    // The exact key, not just "some key": a mock that answers for anything
    // would pass even if the implementation read a prefix that does not
    // exist in production, where the result is a silently absent heartbeat.
    expect(mockRedisGet).toHaveBeenCalledWith(`session:hb:${SESSION_ID}`);
    expect(health.heartbeatAge).toBeGreaterThanOrEqual(45_000);
    expect(health.authInvalidated).toBe(true);
    // getSessionHealth ORs the two sources, so now that a 401 sets the status
    // to 'auth_failure' the assertion above would pass on the status alone --
    // including for an implementation that stopped writing the metadata flag.
    // That flag is what RecoveryRunner's latch reads, so pin it directly.
    expect(manager.getSession(SESSION_ID)!.metadata!.authInvalidated).toBe(true);
    expect(health.status).toBe('auth_failure');
  });

  it('reports_the_disconnect_upstream_on_every_close_that_is_not_a_restart', async () => {
    // handleSessionDisconnect is injected so the persisted row and its
    // reconnectCount keep being maintained. A manager that never calls it
    // drops that bookkeeping and nothing else in this file notices.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
    });
    await Promise.resolve();
    expect(sessionDisconnect).not.toHaveBeenCalled();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await Promise.resolve();
    // Exactly once, not "at least once": a close handler that reports the
    // disconnect on every path -- including the restart one it just skipped,
    // or twice for one event -- satisfies toHaveBeenCalledWith and floods the
    // persisted reconnectCount.
    expect(sessionDisconnect).toHaveBeenCalledTimes(1);
    // NETWORK_ERROR, not WHATSAPP_DISCONNECT: see
    // `a_transient_close_does_not_bar_the_session_from_recovery` below for why
    // the string is load-bearing.
    expect(sessionDisconnect).toHaveBeenCalledWith(
      SESSION_ID, 'NETWORK_ERROR', expect.anything()
    );

    sessionDisconnect.mockClear();
    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    await Promise.resolve();
    expect(sessionDisconnect).toHaveBeenCalledTimes(1);
    expect(sessionDisconnect).toHaveBeenCalledWith(
      SESSION_ID, 'WHATSAPP_LOGGED_OUT', expect.anything()
    );

    jest.useRealTimers();
  });
});

describe('BaileysSessionManager inbound messages', () => {
  it('processes_notify_batches_and_ignores_history_appends', async () => {
    // 'append' is history sync. Feeding it to the pipeline would replay old
    // conversations through the AI and answer them.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('messages.upsert', {
      type: 'append',
      messages: [{ key: { remoteJid: '34600111222@s.whatsapp.net', id: 'OLD' }, message: { conversation: 'viejo' } }],
    });
    await Promise.resolve();
    expect(pipeline.handle).not.toHaveBeenCalled();

    sock.emit('messages.upsert', {
      type: 'notify',
      messages: [{ key: { remoteJid: '34600111222@s.whatsapp.net', id: 'NEW' }, message: { conversation: 'nuevo' } }],
    });
    await Promise.resolve();
    expect(pipeline.handle).toHaveBeenCalledTimes(1);
    expect(pipeline.handle.mock.calls[0][0].text).toBe('nuevo');
    // The port is the second argument and nothing downstream can answer
    // without it. Omitting it entirely leaves a DTO-only assertion green and
    // produces a bot that receives every message and replies to none.
    const port = pipeline.handle.mock.calls[0][1];
    expect(typeof port?.reply).toBe('function');
    expect(typeof port?.send).toBe('function');
    expect(typeof port?.startTyping).toBe('function');
    expect(typeof port?.stopTyping).toBe('function');
  });

  it('drops_status_broadcast_before_normalizing', async () => {
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('messages.upsert', {
      type: 'notify',
      messages: [{ key: { remoteJid: 'status@broadcast', id: 'S1' }, message: { conversation: 'x' } }],
    });
    await Promise.resolve();

    expect(pipeline.handle).not.toHaveBeenCalled();
  });
});

describe('BaileysSessionManager shutdown vs delete', () => {
  // This contract is inherited, not new. Phase 1 Task 1 established it after
  // finding that every pm2 restart -- i.e. every deploy -- ran the same path
  // as a deliberate DELETE /sessions/:id, deactivating the session and
  // wiping its credentials. Thirty disconnected sessions in production are
  // what that bug left behind.
  //
  // SessionManager.shutdown.spec.ts pinned it against the old engine and
  // Task 8b deletes that file. This block is where the guarantee
  // continues to live, so the deletion costs no coverage.

  it('shutdown_closes_the_socket_without_clearing_credentials', async () => {
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    await manager.destroySession(SESSION_ID, 'shutdown');

    expect(sock.end).toHaveBeenCalledTimes(1);
    expect(sock.logout).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('shutdownAll_closes_every_session_in_shutdown_mode', async () => {
    // This is the path a pm2 restart actually takes. Testing destroySession
    // directly leaves shutdownAll -- the only caller in production -- with no
    // coverage at all, which is where the Phase 1 bug lived.
    const manager = makeManager();
    await manager.createSession('a');
    await manager.createSession('b');
    const spy = jest.spyOn(manager, 'destroySession');

    await manager.shutdownAll();

    // The session ids too, not only the modes: closing 'a' twice and never
    // touching 'b' produces the same two 'shutdown' strings and leaves a
    // socket alive through the restart.
    expect(spy.mock.calls.map(c => [c[0], c[1]])).toEqual([
      ['a', 'shutdown'],
      ['b', 'shutdown'],
    ]);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('cancels_a_pending_reconnect_when_the_session_is_destroyed', async () => {
    // A timer sleeping through a 60s rung outlives the session it belongs to.
    // Without the clearTimeout, deleting a session leaves a callback that
    // fires half a minute later and opens a socket for a session that no
    // longer exists, using credentials destroySession already cleared.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await manager.destroySession(SESSION_ID, 'delete');
    // Not "no reconnect happened" -- "no timer exists". rebuild() has its own
    // stopped/runtime guard, so a missing re-check in onClose still yields
    // zero makeWASocket calls while leaving a live setTimeout that keeps the
    // event loop alive through a pm2 shutdown.
    expect(jest.getTimerCount()).toBe(0);

    await jest.advanceTimersByTimeAsync(120000);

    expect(mockMakeWASocket).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does_not_schedule_a_retry_that_was_decided_before_the_session_stopped', async () => {
    // The close handler awaits handleSessionDisconnect before it reaches the
    // scheduling line, so destroySession can run to completion inside that
    // await: listeners off, socket ended, timer cleared. The handler then
    // resumes and schedules a retry for a session that no longer exists --
    // and every teardown assertion has already passed. clearTimeout cannot
    // cancel a setTimeout that has not been created yet; only a re-check
    // after the last await can.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    // Hold the close handler open exactly where the race lives.
    let release!: () => void;
    sessionDisconnect.mockImplementation(
      () => new Promise<void>(resolve => { release = resolve; })
    );

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await Promise.resolve();

    // Destroy while the handler is suspended, then let it resume.
    await manager.destroySession(SESSION_ID, 'delete');
    release();
    // Drain the microtask queue rather than ticking it once: the resumed
    // handler has several awaits left before it reaches anything observable,
    // and a single Promise.resolve() asserts on a handler that has not got
    // there yet -- which passes for every implementation, including the broken
    // one. advanceTimersByTimeAsync(0) fires no pending retry (the shortest
    // rung is 2 s), so the timer assertion below still means what it says.
    await jest.advanceTimersByTimeAsync(0);
    // After the handler has resumed -- that is the whole point of this test --
    // and before any timer can fire. A retry scheduled here would no-op when
    // it fired, and still hold the event loop open through a pm2 shutdown.
    expect(jest.getTimerCount()).toBe(0);
    // And nothing else the resumed handler could still emit: a `disconnected`
    // webhook for a session that was deliberately deleted tells the dashboard
    // and apps/api about a drop that did not happen.
    expect(
      publisher.sendWebhook.mock.calls
        .map((c: any[]) => c[0])
        .filter((p: any) => p.event === 'disconnected')
    ).toHaveLength(0);
    // The stop flag is released on the way out of destroySession -- a set that
    // is only ever added to grows for the process lifetime -- so what stops the
    // resumed handler above is the missing runtime, not the flag.
    expect((manager as any).stopped.size).toBe(0);

    await jest.advanceTimersByTimeAsync(120000);

    expect(mockMakeWASocket).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it.each([
    ['shutdown mode', (m: any) => m.destroySession(SESSION_ID, 'shutdown')],
    ['shutdownAll', (m: any) => m.shutdownAll()],
    ['forceDisconnect', (m: any) => m.forceDisconnect(SESSION_ID)],
  ])('cancels_a_pending_reconnect_on_%s', async (_label, act) => {
    // Testing only the delete path leaves `if (mode === 'delete')
    // clearTimeout(...)` green -- and a pm2 restart with a retry in flight
    // both keeps the event loop alive and reconnects on the way out.
    //
    // The fake's end() emits connection.update{close}, as the real socket
    // does, so this also catches the subtler ordering bug: clearing the timer
    // and *then* calling end() with the listeners still subscribed schedules
    // a brand-new retry from inside the shutdown itself. Zero reconnections
    // is only reachable by unsubscribing before ending.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await act(manager);
    // Not "no reconnect happened" -- "no timer exists". rebuild() has its own
    // stopped/runtime guard, so a missing re-check in onClose still yields
    // zero makeWASocket calls while leaving a live setTimeout that keeps the
    // event loop alive through a pm2 shutdown. forceDisconnect is the case
    // that bites: it keeps the runtime on purpose, so scheduleRetry does not
    // bail on its own and only the onClose re-check stops the timer existing.
    expect(jest.getTimerCount()).toBe(0);

    await jest.advanceTimersByTimeAsync(120000);

    expect(mockMakeWASocket).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('delete_logs_out_and_clears_credentials', async () => {
    // The mirror image. Without this, a destroySession that never cleared
    // anything would satisfy the test above and leave dead credentials
    // behind on every deliberate delete.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    await manager.destroySession(SESSION_ID, 'delete');

    expect(sock.logout).toHaveBeenCalledTimes(1);
    expect(store.clear).toHaveBeenCalledWith(SESSION_ID);
  });
});
