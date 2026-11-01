import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';
import type { Consumer, Producer } from 'kafkajs';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { SagaEventHandler, SagaEnvelope } from '../../application/use-cases/saga-event.handler';
import type { IExecucaoRepository } from '../../domain/ports/execucao.repository';
import { runWithLogContext } from '../../../../shared/infrastructure/logging/pino-logger.config';

const RETRY_TOPIC = 'execucao.retry.v1';
const DLT_TOPIC = 'execucao.dlt.v1';
const MAX_ATTEMPTS = 3;

export function retryDecision(outcome: string, attempts: number): 'retry' | 'dlt' | 'done' {
  if (outcome === 'processed' || outcome === 'ignore') return 'done';
  if (outcome === 'business-error' || attempts >= MAX_ATTEMPTS) return 'dlt';
  return 'retry';
}

const RECOGNIZED_EVENTS = new Set([
  'OrdemServicoRecebida',
  'PagamentoConfirmado',
  'OrcamentoRecusado',
  'PagamentoRecusado',
  'EtapaDaSagaFalhou',
]);

function isEnvelope(
  value: unknown,
  key?: string
): value is SagaEnvelope & {
  retry?: { attempt: number; firstFailedAt: string; notBefore: string };
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const data = candidate.data as Record<string, unknown> | null;
  const retry = candidate.retry as Record<string, unknown> | undefined;
  const validRetry =
    candidate.retry === undefined ||
    (!!retry &&
      Number.isInteger(retry.attempt) &&
      Number(retry.attempt) >= 2 &&
      Number(retry.attempt) <= MAX_ATTEMPTS &&
      typeof retry.firstFailedAt === 'string' &&
      Number.isFinite(Date.parse(retry.firstFailedAt)) &&
      typeof retry.notBefore === 'string' &&
      Number.isFinite(Date.parse(retry.notBefore)));
  return (
    typeof candidate.eventId === 'string' &&
    candidate.eventId.length > 0 &&
    typeof candidate.eventType === 'string' &&
    candidate.eventType.length > 0 &&
    typeof candidate.producer === 'string' &&
    candidate.producer.length > 0 &&
    candidate.eventVersion === 1 &&
    typeof candidate.occurredAt === 'string' &&
    typeof candidate.correlationId === 'string' &&
    !!candidate.data &&
    typeof candidate.data === 'object' &&
    !Array.isArray(candidate.data) &&
    validRetry &&
    (!RECOGNIZED_EVENTS.has(candidate.eventType) ||
      (data !== null &&
        typeof data.ordemServicoId === 'string' &&
        !!data.ordemServicoId &&
        candidate.correlationId === data.ordemServicoId &&
        key === data.ordemServicoId))
  );
}

@Injectable()
export class KafkaSagaEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  private readonly handler: SagaEventHandler;
  private consumerConnected = false;
  private producerConnected = false;

  constructor(
    config: ConfigService,
    repo: IExecucaoRepository,
    private readonly pino: PinoLogger
  ) {
    const username = config.get<string>('KAFKA_SASL_USERNAME');
    const password = config.get<string>('KAFKA_SASL_PASSWORD');
    this.kafka = new Kafka({
      clientId: 'execucao-producao-service',
      brokers: (config.get<string>('KAFKA_BROKERS') ?? 'localhost:9092').split(','),
      ...(username || password
        ? username && password
          ? { sasl: { mechanism: 'plain' as const, username, password } }
          : (() => {
              throw new Error('Both KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD are required');
            })()
        : {}),
    });
    this.consumer = this.kafka.consumer({
      groupId: config.get<string>('KAFKA_CONSUMER_GROUP') || 'execucao-consumer',
    });
    this.producer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
    this.handler = new SagaEventHandler(repo);
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await Promise.all([this.consumer.connect(), this.producer.connect()]);
    this.consumerConnected = true;
    this.producerConnected = true;
    await this.consumer.subscribe({ topics: ['os.eventos.v1', 'billing.eventos.v1'] });
    await this.consumer.subscribe({ topic: RETRY_TOPIC, fromBeginning: true });
    await this.consumer.run({
      partitionsConsumedConcurrently: 4,
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;
        let parsed: SagaEnvelope & {
          retry?: { attempt: number; firstFailedAt: string; notBefore: string };
        };
        try {
          const candidate: unknown = JSON.parse(message.value.toString());
          if (!isEnvelope(candidate, message.key?.toString()))
            throw new Error('Invalid Kafka event envelope');
          parsed = candidate;
        } catch {
          const invalidEventId = randomUUID();
          const invalidKey = message.key?.toString() ?? null;
          this.pino.error(
            {
              eventId: invalidEventId,
              correlationId: invalidKey ?? invalidEventId,
              ordemServicoId: invalidKey,
              topic,
            },
            'Invalid Saga event envelope'
          );
          await this.send(
            DLT_TOPIC,
            invalidKey ?? undefined,
            JSON.stringify({
              eventId: invalidEventId,
              eventType: 'InvalidEnvelope',
              eventVersion: 1,
              occurredAt: new Date().toISOString(),
              producer: 'execucao-producao-service',
              correlationId: invalidKey ?? invalidEventId,
              data: {
                sourceTopic: topic,
                ordemServicoId: invalidKey,
                summary: 'Malformed Kafka envelope',
              },
              retry: {
                attempt: 1,
                firstFailedAt: new Date().toISOString(),
                notBefore: new Date().toISOString(),
              },
              lastError: 'Invalid Kafka event envelope',
            })
          );
          return;
        }
        const orderValue = parsed.data?.ordemServicoId;
        const orderId = typeof orderValue === 'string' ? orderValue : undefined;
        const eventId = parsed.eventId;
        const correlationId = typeof orderId === 'string' ? orderId : parsed.correlationId;
        await runWithLogContext(
          {
            eventId,
            correlationId,
            ordemServicoId: typeof orderId === 'string' ? orderId : undefined,
          },
          async () => {
            this.pino.info(
              { eventId, correlationId, ordemServicoId: orderId },
              'Saga event received'
            );
            if (topic === RETRY_TOPIC && parsed.retry?.notBefore) {
              const waitMs = Date.parse(parsed.retry.notBefore) - Date.now();
              if (waitMs > 0) {
                this.consumer.pause([{ topic, partitions: [partition] }]);
                await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
                this.consumer.resume([{ topic, partitions: [partition] }]);
              }
            }
            let outcome: import('../../application/use-cases/saga-event.handler').EventOutcome;
            let lastError = 'Event processing failed';
            try {
              outcome = await this.handler.handle(parsed);
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
              this.pino.error(
                { err: error, eventId, correlationId, ordemServicoId: orderId },
                'Saga event failed'
              );
              outcome = 'retryable';
            }
            this.pino.info(
              { eventId, correlationId, ordemServicoId: orderId, outcome },
              'Saga event handled'
            );
            const attempt = parsed.retry?.attempt ?? 1;
            const decision = retryDecision(outcome, attempt);
            if (decision === 'done') return;
            if (decision === 'dlt') {
              await this.send(
                DLT_TOPIC,
                orderId ?? '',
                JSON.stringify({
                  ...parsed,
                  lastError:
                    outcome === 'business-error'
                      ? 'Invalid event payload or Saga stage'
                      : lastError,
                  retry: {
                    attempt,
                    firstFailedAt: parsed.retry?.firstFailedAt ?? new Date().toISOString(),
                    notBefore: parsed.retry?.notBefore ?? new Date().toISOString(),
                  },
                })
              );
              return;
            }
            const delayMs = 1000 * 2 ** (attempt - 1);
            await this.send(
              RETRY_TOPIC,
              orderId ?? '',
              JSON.stringify({
                ...parsed,
                retry: {
                  attempt: attempt + 1,
                  firstFailedAt: parsed.retry?.firstFailedAt ?? new Date().toISOString(),
                  notBefore: new Date(Date.now() + delayMs).toISOString(),
                },
                lastError,
              })
            );
          }
        );
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await Promise.all([
      ...(this.consumerConnected ? [this.consumer.disconnect()] : []),
      ...(this.producerConnected ? [this.producer.disconnect()] : []),
    ]);
  }

  private async send(topic: string, key: string | undefined, value: string): Promise<void> {
    await this.producer.send({ topic, acks: -1, messages: [{ key, value }] });
  }
}
