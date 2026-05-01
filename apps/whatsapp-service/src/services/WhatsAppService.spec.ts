import { WhatsAppService } from './WhatsAppService';

// Spy on the prototype BEFORE constructing — this way any accidental
// re-introduction of `this.initialize()` (or the underlying runInitialize)
// inside the constructor would still hit the mock and reveal itself, instead
// of silently invoking the real implementation against unmocked Redis/etc.
function spyOnRunInitialize(impl: () => Promise<void>): jest.Mock<Promise<void>, []> {
  const mock = jest.fn(impl);
  jest
    .spyOn(WhatsAppService.prototype as unknown as { runInitialize: () => Promise<void> }, 'runInitialize')
    .mockImplementation(mock);
  return mock;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('WhatsAppService.initialize idempotency', () => {
  test('runs the real init body exactly once even with two sequential calls', async () => {
    const run = spyOnRunInitialize(() => Promise.resolve());
    const svc = new WhatsAppService();

    await svc.initialize();
    await svc.initialize();

    expect(run).toHaveBeenCalledTimes(1);
  });

  test('two concurrent calls share the same in-flight promise', async () => {
    let resolveInner: () => void = () => undefined;
    const run = spyOnRunInitialize(
      () =>
        new Promise<void>(res => {
          resolveInner = res;
        })
    );
    const svc = new WhatsAppService();

    const p1 = svc.initialize();
    const p2 = svc.initialize();
    expect(run).toHaveBeenCalledTimes(1);

    resolveInner();
    await Promise.all([p1, p2]);

    // Subsequent call after settle is a fast no-op, still one run.
    await svc.initialize();
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('after a failure the promise is cleared so a retry can run again', async () => {
    let attempt = 0;
    const run = spyOnRunInitialize(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('boom')) : Promise.resolve();
    });
    const svc = new WhatsAppService();

    await expect(svc.initialize()).rejects.toThrow('boom');
    await expect(svc.initialize()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });

  test('constructor does not start initialization on import', () => {
    const run = spyOnRunInitialize(() => Promise.resolve());
    const svc = new WhatsAppService();

    // No call yet — caller must opt in via initialize(). This guards against
    // regressions that re-introduce a fire-and-forget this.initialize() in
    // the constructor.
    expect(run).not.toHaveBeenCalled();
    void svc;
  });
});
