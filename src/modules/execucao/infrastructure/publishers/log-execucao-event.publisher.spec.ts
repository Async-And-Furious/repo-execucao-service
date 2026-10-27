import { Logger } from '@nestjs/common';
import { DiagnosticoIniciado } from '../../domain/events/execucao.events';
import { LogExecucaoEventPublisher } from './log-execucao-event.publisher';

describe('LogExecucaoEventPublisher', () => {
  it('registra eventType, correlationId e data no log', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const evento = new DiagnosticoIniciado({
      execucaoId: 'exec-1',
      ordemServicoId: 'os-1',
      responsavelId: 'mec-1',
      diagnosticoIniciadoEm: '2026-10-27T10:00:00.000Z',
    });

    await new LogExecucaoEventPublisher().publish(evento);

    expect(log).toHaveBeenCalledWith(
      `DiagnosticoIniciado correlationId=os-1 data=${JSON.stringify(evento.data)}`
    );
    log.mockRestore();
  });
});
