const mockConsumer = {
  connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  subscribe: jest.fn<Promise<void>, [Record<string, unknown>]>().mockResolvedValue(undefined),
  run: jest.fn<Promise<void>, [Record<string, unknown>]>().mockResolvedValue(undefined),
  disconnect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  pause: jest.fn<void, [unknown]>(),
  resume: jest.fn<void, [unknown]>(),
};
const mockProducer = {
  connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  send: jest.fn<Promise<void>, [Record<string, unknown>]>().mockResolvedValue(undefined),
  disconnect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
};
interface MockKafkaInstance {
  options: Record<string, unknown>;
  consumer: jest.Mock<typeof mockConsumer, [Record<string, unknown>]>;
  producer: jest.Mock<typeof mockProducer, [Record<string, unknown>]>;
}
const mockKafkaInstances: MockKafkaInstance[] = [];
const mockHandle = jest.fn<Promise<string>, [unknown]>();

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation((options: Record<string, unknown>) => {
    const instance: MockKafkaInstance = {
      options,
      consumer: jest.fn().mockReturnValue(mockConsumer),
      producer: jest.fn().mockReturnValue(mockProducer),
    };
    mockKafkaInstances.push(instance);
    return instance;
  }),
}));
jest.mock('../src/modules/execucao/application/use-cases/saga-event.handler', () => ({
  SagaEventHandler: jest.fn().mockImplementation(() => ({ handle: mockHandle })),
}));

import { KafkaSagaEventConsumer } from '../src/modules/execucao/infrastructure/consumers/kafka-saga-event.consumer';

type EachMessage = (payload: {
  topic: string;
  partition: number;
  message: { key: Buffer | null; value: Buffer | null };
  heartbeat: () => Promise<void>;
}) => Promise<void>;
const orderId = 'order-123';
const envelope = (eventType = 'PagamentoConfirmado') => ({
  eventId: 'event-1',
  eventType,
  eventVersion: 1,
  occurredAt: '2026-11-01T00:00:00.000Z',
  producer: 'billing-service',
  correlationId: orderId,
  data: { ordemServicoId: orderId },
});
const config = { get: (key: string) => (key === 'KAFKA_BROKERS' ? 'kafka:9092' : undefined) };
const logger = { info: jest.fn(), error: jest.fn() };

describe('KafkaSagaEventConsumer', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  let consumer: KafkaSagaEventConsumer;
  let eachMessage: EachMessage;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    jest.clearAllMocks();
    mockKafkaInstances.length = 0;
    mockHandle.mockResolvedValue('processed');
    consumer = new KafkaSagaEventConsumer(config as never, {} as never, logger as never);
  });
  afterAll(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  async function start(): Promise<void> {
    await consumer.onModuleInit();
    const options = mockConsumer.run.mock.calls[0][0];
    eachMessage = options.eachMessage as EachMessage;
  }
  async function deliver(
    value: unknown,
    topic = 'billing.eventos.v1',
    key: string | null = orderId
  ): Promise<void> {
    await eachMessage({
      topic,
      partition: 2,
      message: {
        key: key === null ? null : Buffer.from(key),
        value:
          value === null
            ? null
            : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
      },
      heartbeat: jest.fn().mockResolvedValue(undefined),
    });
  }
  const sent = () => mockProducer.send.mock.calls.map(([request]) => request);

  it('connects, subscribes to sources and retry topic, and configures concurrency', async () => {
    await start();
    expect(mockConsumer.connect).toHaveBeenCalledTimes(1);
    expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    expect(mockConsumer.subscribe.mock.calls).toEqual([
      [{ topics: ['os.eventos.v1', 'billing.eventos.v1'], fromBeginning: true }],
      [{ topic: 'execucao.retry.v1', fromBeginning: true }],
    ]);
    expect(mockConsumer.run.mock.calls[0][0]).toMatchObject({ partitionsConsumedConcurrently: 4 });
  });

  it('routes tombstones to DLT and processes valid events', async () => {
    await start();
    await deliver(null);
    await deliver(envelope());
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({ topic: 'execucao.dlt.v1' });
    expect(
      JSON.parse(String((sent()[0].messages as Array<{ value: string }>)[0].value))
    ).toMatchObject({ eventType: 'InvalidEnvelope', lastError: 'Kafka message has no value' });
  });

  it('sends retry metadata and handles retry backlog', async () => {
    mockHandle.mockResolvedValueOnce('retryable').mockResolvedValueOnce('processed');
    await start();
    await deliver(envelope());
    const retry = JSON.parse(
      String(sent()[0].messages && (sent()[0].messages as Array<{ value: string }>)[0].value)
    );
    expect(sent()[0]).toMatchObject({ topic: 'execucao.retry.v1', acks: -1 });
    expect(retry.retry).toMatchObject({
      attempt: 1,
      firstFailedAt: expect.any(String),
      notBefore: expect.any(String),
    });
    expect(Date.parse(retry.retry.notBefore) - Date.now()).toBeGreaterThanOrEqual(29_990);
    expect(Date.parse(retry.retry.notBefore) - Date.now()).toBeLessThanOrEqual(30_000);
    await deliver(
      {
        ...envelope(),
        retry: {
          attempt: 1,
          firstFailedAt: '2026-11-01T00:00:00Z',
          notBefore: '2020-01-01T00:00:00Z',
        },
      },
      'execucao.retry.v1'
    );
    expect(mockHandle).toHaveBeenCalledTimes(2);
    expect(sent()).toHaveLength(1);
  });

  it('sends the third retryable attempt to DLT with lastError', async () => {
    mockHandle.mockRejectedValue(new Error('database unavailable'));
    await start();
    await deliver(
      {
        ...envelope(),
        retry: {
          attempt: 2,
          firstFailedAt: '2026-11-01T00:00:00Z',
          notBefore: '2020-01-01T00:00:00Z',
        },
      },
      'execucao.retry.v1'
    );
    expect(sent()[0]).toMatchObject({ topic: 'execucao.dlt.v1' });
    expect(
      JSON.parse(String((sent()[0].messages as Array<{ value: string }>)[0].value))
    ).toMatchObject({ lastError: 'database unavailable', retry: { attempt: 3 } });
  });

  it('propagates the original envelope and schedules the second retry after 60 seconds', async () => {
    mockHandle.mockResolvedValue('retryable');
    await start();
    await deliver(envelope());
    const firstRetry = JSON.parse(
      String((sent()[0].messages as Array<{ value: string }>)[0].value)
    );
    await deliver(
      {
        ...firstRetry,
        retry: { ...firstRetry.retry, notBefore: '2020-01-01T00:00:00Z' },
      },
      'execucao.retry.v1'
    );
    const secondRetry = JSON.parse(
      String((sent()[1].messages as Array<{ value: string }>)[0].value)
    );
    expect(secondRetry).toMatchObject({
      eventId: 'event-1',
      eventType: 'PagamentoConfirmado',
      data: { ordemServicoId: orderId },
      retry: { attempt: 2 },
    });
    expect(Date.parse(secondRetry.retry.notBefore) - Date.now()).toBeGreaterThanOrEqual(59_990);
    expect(Date.parse(secondRetry.retry.notBefore) - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it('sends business errors immediately to DLT', async () => {
    mockHandle.mockResolvedValue('business-error');
    await start();
    await deliver(envelope());
    expect(sent()[0]).toMatchObject({ topic: 'execucao.dlt.v1' });
    expect(
      JSON.parse(String((sent()[0].messages as Array<{ value: string }>)[0].value)).lastError
    ).toBe('Invalid event payload or Saga stage');
  });

  it('summarizes malformed envelopes without leaking raw bytes', async () => {
    await start();
    await deliver('{secret raw payload');
    const dlt = JSON.parse(String((sent()[0].messages as Array<{ value: string }>)[0].value));
    expect(dlt).toMatchObject({
      eventType: 'InvalidEnvelope',
      data: { summary: 'Invalid Kafka event envelope' },
      lastError: 'Invalid Kafka event envelope',
    });
    expect(JSON.stringify(dlt)).not.toContain('secret raw payload');
  });

  it.each([
    ['key mismatch', { ...envelope(), data: { ordemServicoId: 'other' } }, orderId],
    ['correlation mismatch', { ...envelope(), correlationId: 'other' }, orderId],
  ])('routes %s to DLT', async (_label, value, key) => {
    await start();
    await deliver(value, 'billing.eventos.v1', key);
    expect(sent()[0]).toMatchObject({ topic: 'execucao.dlt.v1' });
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it('pauses and resumes a retry partition until notBefore', async () => {
    jest.useFakeTimers();
    const notBefore = new Date(Date.now() + 5000).toISOString();
    await start();
    const delivery = deliver(
      { ...envelope(), retry: { attempt: 2, firstFailedAt: new Date().toISOString(), notBefore } },
      'execucao.retry.v1'
    );
    await Promise.resolve();
    expect(mockConsumer.pause).toHaveBeenCalledWith([
      { topic: 'execucao.retry.v1', partitions: [2] },
    ]);
    await jest.advanceTimersByTimeAsync(5000);
    await delivery;
    expect(mockConsumer.pause).toHaveBeenCalledTimes(1);
    expect(mockConsumer.resume).toHaveBeenCalledTimes(1);
    expect(mockConsumer.resume).toHaveBeenCalledWith([
      { topic: 'execucao.retry.v1', partitions: [2] },
    ]);
    jest.useRealTimers();
  });

  it('heartbeats during retry wait', async () => {
    jest.useFakeTimers();
    const notBefore = new Date(Date.now() + 10_000).toISOString();
    await start();
    const heartbeat = jest.fn().mockResolvedValue(undefined);
    const delivery = eachMessage({
      topic: 'execucao.retry.v1',
      partition: 2,
      message: {
        key: Buffer.from(orderId),
        value: Buffer.from(
          JSON.stringify({
            ...envelope(),
            retry: { attempt: 2, firstFailedAt: notBefore, notBefore },
          })
        ),
      },
      heartbeat,
    });
    await jest.advanceTimersByTimeAsync(10_000);
    await delivery;
    expect(heartbeat).toHaveBeenCalledTimes(2);
    expect(mockConsumer.resume).toHaveBeenCalledWith([
      { topic: 'execucao.retry.v1', partitions: [2] },
    ]);
    jest.useRealTimers();
  });

  it('leaves a failed retry delivery unacknowledged when heartbeat fails', async () => {
    jest.useFakeTimers();
    const notBefore = new Date(Date.now() + 5000).toISOString();
    await start();
    const delivery = eachMessage({
      topic: 'execucao.retry.v1',
      partition: 2,
      message: {
        key: Buffer.from(orderId),
        value: Buffer.from(
          JSON.stringify({
            ...envelope(),
            retry: { attempt: 2, firstFailedAt: notBefore, notBefore },
          })
        ),
      },
      heartbeat: jest.fn().mockRejectedValue(new Error('session lost')),
    });
    const rejected = expect(delivery).rejects.toThrow('session lost');
    await jest.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(mockConsumer.resume).toHaveBeenCalledWith([
      { topic: 'execucao.retry.v1', partitions: [2] },
    ]);
    expect(mockHandle).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('guards lifecycle hooks in test and disconnects connected clients otherwise', async () => {
    process.env.NODE_ENV = 'test';
    await consumer.onModuleInit();
    await consumer.onModuleDestroy();
    expect(mockConsumer.connect).not.toHaveBeenCalled();
    process.env.NODE_ENV = 'development';
    await start();
    await consumer.onModuleDestroy();
    expect(mockConsumer.disconnect).toHaveBeenCalledTimes(1);
    expect(mockProducer.disconnect).toHaveBeenCalledTimes(1);
  });
});
