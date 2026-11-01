import { retryDecision } from '../src/modules/execucao/infrastructure/consumers/kafka-saga-event.consumer';

describe('Kafka retry policy', () => {
  it('allows two retries after first delivery, for three total attempts', () => {
    expect(retryDecision('retryable', 1)).toBe('retry');
    expect(retryDecision('retryable', 2)).toBe('retry');
    expect(retryDecision('retryable', 3)).toBe('dlt');
  });

  it('does not retry ignores or business errors', () => {
    expect(retryDecision('ignore', 1)).toBe('done');
    expect(retryDecision('processed', 1)).toBe('done');
    expect(retryDecision('business-error', 1)).toBe('dlt');
  });
});
