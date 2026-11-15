import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';
import type { Producer } from 'kafkajs';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { EventoExecucao } from '../../domain/events/execucao.events';
import { IExecucaoEventPublisher } from '../../domain/ports/execucao-event-publisher';
import { injetarHeadersTrace } from '../../../../shared/infrastructure/observability/kafka-trace';

@Injectable()
export class KafkaExecucaoEventPublisher implements IExecucaoEventPublisher, OnModuleDestroy {
  private readonly producer: Producer;
  private connected?: Promise<void>;

  constructor(
    config: ConfigService,
    private readonly pino: PinoLogger
  ) {
    const username = config.get<string>('KAFKA_SASL_USERNAME');
    const password = config.get<string>('KAFKA_SASL_PASSWORD');
    this.producer = new Kafka({
      clientId: 'execucao-producao-service',
      brokers: (config.get<string>('KAFKA_BROKERS') ?? 'localhost:9092').split(','),
      ...(username || password
        ? username && password
          ? { sasl: { mechanism: 'plain' as const, username, password } }
          : (() => {
              throw new Error('Both KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD are required');
            })()
        : {}),
    }).producer({ idempotent: true, maxInFlightRequests: 1 });
  }

  async publish(evento: EventoExecucao): Promise<void> {
    const occurredAt =
      'diagnosticoIniciadoEm' in evento.data
        ? evento.data.diagnosticoIniciadoEm
        : 'reparoIniciadoEm' in evento.data
          ? evento.data.reparoIniciadoEm
          : evento.data.concluidaEm;
    const eventId = randomUUID();
    const logFields = {
      ordemServicoId: evento.data.ordemServicoId,
      eventId,
      eventType: evento.eventType,
      correlationId: evento.correlationId,
    };
    try {
      await this.connect();
      await this.producer.send({
        topic: 'execucao.eventos.v1',
        acks: -1,
        messages: [
          {
            key: evento.data.ordemServicoId,
            headers: injetarHeadersTrace(),
            value: JSON.stringify({
              eventId,
              eventType: evento.eventType,
              eventVersion: 1,
              occurredAt,
              producer: 'execucao-producao-service',
              correlationId: evento.correlationId,
              data: evento.data,
            }),
          },
        ],
      });
      this.pino.info(logFields, 'Saga event published');
    } catch (error) {
      this.pino.error(logFields, 'Saga event publish failed after database commit');
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.connected;
      await this.producer.disconnect();
    }
  }

  private async connect(): Promise<void> {
    this.connected ??= this.producer.connect();
    try {
      await this.connected;
    } catch (error) {
      this.connected = undefined;
      throw error;
    }
  }
}
