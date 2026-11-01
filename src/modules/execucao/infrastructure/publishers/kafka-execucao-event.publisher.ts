import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';
import type { Producer } from 'kafkajs';
import { randomUUID } from 'node:crypto';
import { EventoExecucao } from '../../domain/events/execucao.events';
import { IExecucaoEventPublisher } from '../../domain/ports/execucao-event-publisher';

@Injectable()
export class KafkaExecucaoEventPublisher implements IExecucaoEventPublisher, OnModuleDestroy {
  private readonly producer: Producer;
  private connected?: Promise<void>;

  constructor(config: ConfigService) {
    const username = config.get<string>('KAFKA_SASL_USERNAME');
    const password = config.get<string>('KAFKA_SASL_PASSWORD');
    this.producer = new Kafka({
      clientId: 'execucao-service',
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
    this.connected ??= this.producer.connect();
    await this.connected;
    await this.producer.send({
      topic: 'execucao.eventos.v1',
      acks: -1,
      messages: [
        {
          key: evento.data.ordemServicoId,
          value: JSON.stringify({
            eventId: randomUUID(),
            eventType: evento.eventType,
            eventVersion: 1,
            occurredAt: new Date().toISOString(),
            producer: 'execucao-producao-service',
            correlationId: evento.correlationId,
            data: evento.data,
          }),
        },
      ],
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.connected;
      await this.producer.disconnect();
    }
  }
}
