const mockProducer = {
  connect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
};
const logger = { error: jest.fn() };
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
    const publisher = new KafkaExecucaoEventPublisher(
      {
        get: (key: string) => (({ KAFKA_BROKERS: 'kafka:9092' }) as Record<string, string>)[key],
      } as never,
      logger as never
    );
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
      occurredAt: event.data.diagnosticoIniciadoEm,
      producer: 'execucao-producao-service',
      correlationId: 'os-1',
      data: event.data,
    });
  });

  it('retries producer connection after an initial connection failure', async () => {
    mockProducer.connect
      .mockRejectedValueOnce(new Error('broker unavailable'))
      .mockResolvedValueOnce(undefined);
    const publisher = new KafkaExecucaoEventPublisher(
      {
        get: (key: string) => (({ KAFKA_BROKERS: 'kafka:9092' }) as Record<string, string>)[key],
      } as never,
      logger as never
    );
    const event = new DiagnosticoIniciado({
      execucaoId: 'ex-1',
      ordemServicoId: 'os-1',
      responsavelId: null,
      diagnosticoIniciadoEm: '2026-11-01T00:00:00.000Z',
    });

    await expect(publisher.publish(event)).rejects.toThrow('broker unavailable');
    await expect(publisher.publish(event)).resolves.toBeUndefined();
    expect(mockProducer.connect).toHaveBeenCalledTimes(2);
    expect(mockProducer.send).toHaveBeenCalledTimes(1);
  });

  it('uses SASL only when both configured env values exist and rejects partial credentials', () => {
    new KafkaExecucaoEventPublisher(
      {
        get: (key: string) =>
          (
            ({ KAFKA_SASL_USERNAME: 'user', KAFKA_SASL_PASSWORD: 'pass' }) as Record<string, string>
          )[key],
      } as never,
      logger as never
    );
    expect(mockKafkaInstances[0].options.sasl).toEqual({
      mechanism: 'plain',
      username: 'user',
      password: 'pass',
    });
    expect(
      () =>
        new KafkaExecucaoEventPublisher(
          {
            get: (key: string) => (key === 'KAFKA_SASL_PASSWORD' ? 'pass' : undefined),
          } as never,
          logger as never
        )
    ).toThrow('Both KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD are required');
  });

  it('logs safe correlation fields and rethrows a publish failure', async () => {
    const error = new Error('broker unavailable');
    mockProducer.send.mockRejectedValueOnce(error);
    const publisher = new KafkaExecucaoEventPublisher(
      { get: () => undefined } as never,
      logger as never
    );
    const event = new DiagnosticoIniciado({
      execucaoId: 'ex-1',
      ordemServicoId: 'os-1',
      responsavelId: null,
      diagnosticoIniciadoEm: '2026-11-01T00:00:00.000Z',
    });

    await expect(publisher.publish(event)).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      { ordemServicoId: 'os-1', eventType: 'DiagnosticoIniciado', correlationId: 'os-1' },
      'Saga event publish failed after database commit'
    );
  });
});
