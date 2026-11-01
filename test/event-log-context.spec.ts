import {
  currentLogContext,
  logContext,
  runWithLogContext,
} from '../src/shared/infrastructure/logging/pino-logger.config';

describe('event log context', () => {
  it('provides event identifiers to logs inside handler scope without leaking to concurrent work', async () => {
    await runWithLogContext(
      { eventId: 'ev-1', correlationId: 'os-1', ordemServicoId: 'os-1' },
      async () => {
        await Promise.resolve();
        expect(currentLogContext()).toEqual({
          eventId: 'ev-1',
          correlationId: 'os-1',
          ordemServicoId: 'os-1',
        });
        expect(logContext({})).toEqual(currentLogContext());
      }
    );
    expect(currentLogContext()).toEqual({});
  });
});
