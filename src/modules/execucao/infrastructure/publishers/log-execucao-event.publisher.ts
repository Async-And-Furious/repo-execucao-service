import { Injectable, Logger } from '@nestjs/common';
import { EventoExecucao } from '../../domain/events/execucao.events';
import { IExecucaoEventPublisher } from '../../domain/ports/execucao-event-publisher';

// ponytail: so registra no log; a Feature de Eventos troca este adapter por um de Kafka (execucao.eventos.v1).
@Injectable()
export class LogExecucaoEventPublisher implements IExecucaoEventPublisher {
  private readonly logger = new Logger(LogExecucaoEventPublisher.name);

  publish(evento: EventoExecucao): Promise<void> {
    this.logger.log(
      `${evento.eventType} correlationId=${evento.correlationId} data=${JSON.stringify(evento.data)}`
    );
    return Promise.resolve();
  }
}
