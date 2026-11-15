import { EventoExecucao } from '../events/execucao.events';

export const EXECUCAO_EVENT_PUBLISHER = Symbol('EXECUCAO_EVENT_PUBLISHER');

export interface IExecucaoEventPublisher {
  publish(evento: EventoExecucao): Promise<void>;
}
