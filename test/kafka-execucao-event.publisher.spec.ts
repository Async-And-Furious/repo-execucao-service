const mockProducer = {
  connect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
};
interface MockKafkaInstance {
  options: Record<string, unknown>;
  producer: jest.Mock<unknown, unknown[]>;
}
const mockKafkaInstances: MockKafkaInstance[] = [];

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation((options) => {
    const instance = { options, producer: jest.fn().mockReturnValue(mockProducer) };
    mockKafkaInstances.push(instance);
    return instance;
  }),
}));

import { KafkaExecucaoEventPublisher } from '../src/modules/execucao/infrastructure/publishers/kafka-execucao-event.publisher';
import { DiagnosticoIniciado } from '../src/modules/execucao/domain/events/execucao.events';

describe('KafkaExecucaoEventPublisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKafkaInstances.length = 0;
  });

  it('publishes the ADR envelope keyed and correlated by order ID with idempotence and acks=-1', async () => {
    const publisher = new KafkaExecucaoEventPublisher({
      get: (key: string) => (({ KAFKA_BROKERS: 'kafka:9092' }) as Record<string, string>)[key],
    } as never);
    const event = new DiagnosticoIniciado({
      execucaoId: 'ex-1',
      ordemServicoId: 'os-1',
      responsavelId: null,
      diagnosticoIniciadoEm: '2026-11-01T00:00:00.000Z',
    });
    await publisher.publish(event);
    expect(mockKafkaInstances[0].options).toMatchObject({ brokers: ['kafka:9092'] });
    expect(mockKafkaInstances[0].producer).toHaveBeenCalledWith({
      idempotent: true,
      maxInFlightRequests: 1,
    });
    const request = mockProducer.send.mock.calls[0][0];
    expect(request).toMatchObject({
      topic: 'execucao.eventos.v1',
      acks: -1,
      messages: [{ key: 'os-1' }],
    });
    expect(JSON.parse(String(request.messages[0].value))).toMatchObject({
      eventId: expect.any(String),
      eventType: 'DiagnosticoIniciado',
      eventVersion: 1,
      occurredAt: expect.any(String),
      producer: 'execucao-producao-service',
      correlationId: 'os-1',
      data: event.data,
    });
  });

  it('uses SASL only when both configured env values exist and rejects partial credentials', () => {
    new KafkaExecucaoEventPublisher({
      get: (key: string) =>
        (({ KAFKA_SASL_USERNAME: 'user', KAFKA_SASL_PASSWORD: 'pass' }) as Record<string, string>)[
          key
        ],
    } as never);
    expect(mockKafkaInstances[0].options.sasl).toEqual({
      mechanism: 'plain',
      username: 'user',
      password: 'pass',
    });
    expect(
      () =>
        new KafkaExecucaoEventPublisher({
          get: (key: string) => (key === 'KAFKA_SASL_PASSWORD' ? 'pass' : undefined),
        } as never)
    ).toThrow('Both KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD are required');
  });
});
