jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { validateEnv } from './env';
import { logger } from '../utils/logger';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

it('exits_in_production_when_the_credential_encryption_key_is_missing', () => {
  // Until now this was a warning on purpose: nothing read the key, and
  // exiting for an unused secret would boot-loop Hetzner (see the comment
  // this step replaces). From the cutover on, the key is on the critical
  // path -- without it the service boots green and dies at the first
  // creds.update, which reads as "Baileys is broken" rather than "the env
  // is missing".
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  process.env.NODE_ENV = 'production';
  process.env.WHATSAPP_SERVICE_HMAC_SECRET = 'a'.repeat(64);
  delete process.env.WHATSAPP_AUTH_ENCRYPTION_KEY;

  validateEnv();

  expect(exit).toHaveBeenCalledWith(1);
  exit.mockRestore();
});

it('only_warns_in_development_when_the_credential_encryption_key_is_missing', () => {
  // "did not exit" is satisfied by a validateEnv that does nothing at all.
  // The positive assertion on the warning is what makes this discriminate.
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  process.env.NODE_ENV = 'development';
  process.env.WHATSAPP_SERVICE_HMAC_SECRET = 'a'.repeat(64);
  delete process.env.WHATSAPP_AUTH_ENCRYPTION_KEY;

  validateEnv();

  expect(exit).not.toHaveBeenCalled();
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_AUTH_ENCRYPTION_KEY'));
  exit.mockRestore();
});
