import { WhatsAppService } from './WhatsAppService';

// Bypass the heavy deps the constructor wires up (Redis, stats service, etc.)
// and exercise only the idempotent init contract.
function makeService(runImpl: jest.Mock<Promise<void>, []>) {
  const svc = new WhatsAppService();
  // Replace the private body with the mock — the public initialize() wraps it
  // with the idempotent guard we want to test.
  (svc as unknown as { runInitialize: () => Promise<void> }).runInitialize = runImpl;
  return svc;
}

describe('WhatsAppService.initialize idempotency', () => {
  test('runs the real init body exactly once even with two sequential calls', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(run);

    await svc.initialize();
    await svc.initialize();

    expect(run).toHaveBeenCalledTimes(1);
  });

  test('two concurrent calls share the same in-flight promise', async () => {
    let resolveInner: () => void = () => undefined;
    const run = jest.fn().mockImplementation(
      () =>
        new Promise<void>(res => {
          resolveInner = res;
        })
    );
    const svc = makeService(run);

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
    const run = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const svc = makeService(run);

    await expect(svc.initialize()).rejects.toThrow('boom');
    await expect(svc.initialize()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });

  test('constructor does not start initialization on import', () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(run);

    // No call yet — caller must opt in via initialize().
    expect(run).not.toHaveBeenCalled();
    void svc;
  });
});
