import { makeBaileysLogger } from './baileys-logger';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { logger } from '../../utils/logger';

describe('makeBaileysLogger', () => {
  it('puts_the_message_first_and_the_object_second', () => {
    // The whole reason this adapter exists. Baileys calls info(obj, msg);
    // our logger is info(message, meta). Forwarding the arguments unchanged
    // compiles and logs "[object Object]" for every line Baileys emits.
    makeBaileysLogger().info({ sessionId: 's1' }, 'socket opened');

    expect(logger.info).toHaveBeenCalledWith('[baileys] socket opened', { sessionId: 's1' });
  });

  it('handles_the_single_argument_form', () => {
    makeBaileysLogger().warn('just a string');

    expect(logger.warn).toHaveBeenCalledWith('[baileys] just a string', undefined);
  });

  it('child_carries_its_bindings_into_the_message', () => {
    makeBaileysLogger({ class: 'baileys' }).child({ sessionId: 's1' }).info({}, 'x');

    expect(logger.info).toHaveBeenCalledWith('[baileys class=baileys sessionId=s1] x', {});
  });
});
