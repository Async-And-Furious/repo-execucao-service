import { IncomingMessage } from 'node:http';
import { logContext, resolveCorrelationId } from './pino-logger.config';

describe('pino-logger.config', () => {
  it('reaproveita x-correlation-id valido', () => {
    const req = { headers: { 'x-correlation-id': 'abc-123' } } as unknown as IncomingMessage;
    expect(resolveCorrelationId(req)).toBe('abc-123');
  });

  it('gera id quando o header e invalido', () => {
    const req = { headers: { 'x-correlation-id': 'a b' } } as unknown as IncomingMessage;
    expect(resolveCorrelationId(req)).not.toBe('a b');
  });

  it('logContext preserva ordemServicoId e eventId', () => {
    expect(logContext({ ordemServicoId: 'os-1', eventId: 'ev-1' })).toEqual({
      ordemServicoId: 'os-1',
      eventId: 'ev-1',
    });
  });
});
