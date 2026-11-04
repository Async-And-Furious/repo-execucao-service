import { Execucao, ExecucaoStatus } from '../src/modules/execucao/domain/entities/execucao.entity';
import { IExecucaoRepository } from '../src/modules/execucao/domain/ports/execucao.repository';
import {
  SagaEventHandler,
  SagaEnvelope,
} from '../src/modules/execucao/application/use-cases/saga-event.handler';

function envelope(
  eventType: string,
  _status?: string,
  extra: Record<string, unknown> = {}
): SagaEnvelope {
  return {
    eventId: 'event-1',
    eventType,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: 'os-1',
    data: { ordemServicoId: 'os-1', ...extra },
  };
}

describe('SagaEventHandler', () => {
  let execution: Execucao | null;
  let repo: jest.Mocked<IExecucaoRepository>;
  let handler: SagaEventHandler;

  beforeEach(() => {
    execution = null;
    repo = {
      create: jest.fn((value) => {
        if (execution) return Promise.resolve(false);
        execution = value;
        return Promise.resolve(true);
      }),
      findById: jest.fn(),
      findByOrdemServicoId: jest.fn((_id: string) =>
        Promise.resolve(execution ? Execucao.restaurar(execution.toProps()) : null)
      ),
      save: jest.fn((candidate, expectedStatus) => {
        if (!execution || execution.toProps().status !== expectedStatus)
          return Promise.resolve(false);
        execution = Execucao.restaurar(candidate.toProps());
        return Promise.resolve(true);
      }),
      listar: jest.fn(),
    };
    handler = new SagaEventHandler(repo);
  });

  it('creates once and ignores duplicate orders without a ProcessedEvent store', async () => {
    expect(await handler.handle(envelope('OrdemServicoRecebida'))).toBe('processed');
    expect(execution?.toProps().status).toBe(ExecucaoStatus.AGUARDANDO_DIAGNOSTICO);
    expect(await handler.handle(envelope('OrdemServicoRecebida'))).toBe('ignore');
    expect(repo.create).toHaveBeenCalledTimes(2);
  });

  it('retries missing/early payment and only transitions diagnosis to repair queue', async () => {
    expect(await handler.handle(envelope('PagamentoConfirmado'))).toBe('retryable');
    execution = Execucao.criar('os-1');
    expect(await handler.handle(envelope('PagamentoConfirmado'))).toBe('retryable');
    execution = Execucao.restaurar({
      ...execution.toProps(),
      status: ExecucaoStatus.EM_DIAGNOSTICO,
    });
    expect(await handler.handle(envelope('PagamentoConfirmado'))).toBe('processed');
    expect(execution.toProps().status).toBe(ExecucaoStatus.AGUARDANDO_REPARO);
    expect(await handler.handle(envelope('PagamentoConfirmado'))).toBe('ignore');
    for (const state of [
      ExecucaoStatus.EM_REPARO,
      ExecucaoStatus.CONCLUIDA,
      ExecucaoStatus.CANCELADA,
    ]) {
      execution = Execucao.restaurar({ ...Execucao.criar('os-1').toProps(), status: state });
      expect(await handler.handle(envelope('PagamentoConfirmado'))).toBe('ignore');
    }
  });

  it.each(['OrcamentoRecusado', 'PagamentoRecusado', 'EtapaDaSagaFalhou'])(
    'ignores %s when the execution does not exist',
    async (eventType) => {
      expect(
        await handler.handle(
          eventType === 'EtapaDaSagaFalhou'
            ? envelope(eventType, undefined, { etapa: 'inicio-execucao' })
            : envelope(eventType)
        )
      ).toBe('ignore');
      expect(repo.save).not.toHaveBeenCalled();
    }
  );

  it.each(['OrcamentoRecusado', 'PagamentoRecusado', 'EtapaDaSagaFalhou'])(
    'cancels %s only in allowed states',
    async (eventType) => {
      for (const state of [
        ExecucaoStatus.AGUARDANDO_DIAGNOSTICO,
        ExecucaoStatus.EM_DIAGNOSTICO,
        ExecucaoStatus.AGUARDANDO_REPARO,
      ]) {
        execution = Execucao.restaurar({ ...Execucao.criar('os-1').toProps(), status: state });
        expect(
          await handler.handle(
            eventType === 'EtapaDaSagaFalhou'
              ? envelope(eventType, undefined, { etapa: 'diagnostico' })
              : envelope(eventType)
          )
        ).toBe('processed');
        expect(execution.toProps().status).toBe(ExecucaoStatus.CANCELADA);
      }
      for (const state of [
        ExecucaoStatus.EM_REPARO,
        ExecucaoStatus.CANCELADA,
        ExecucaoStatus.CONCLUIDA,
      ]) {
        execution = Execucao.restaurar({ ...Execucao.criar('os-1').toProps(), status: state });
        expect(
          await handler.handle(
            eventType === 'EtapaDaSagaFalhou'
              ? envelope(eventType, undefined, { etapa: 'diagnostico' })
              : envelope(eventType)
          )
        ).toBe('ignore');
      }
    }
  );

  it('ignores unrelated events and repair failure stages, but rejects invalid stages', async () => {
    execution = Execucao.criar('os-1');
    expect(
      await handler.handle(envelope('EtapaDaSagaFalhou', undefined, { etapa: 'reparo' }))
    ).toBe('ignore');
    expect(await handler.handle(envelope('unexpected'))).toBe('ignore');
    for (const eventType of ['OrcamentoGerado', 'OrcamentoAprovado', 'DiagnosticoIniciado']) {
      expect(await handler.handle(envelope(eventType))).toBe('ignore');
    }
    expect(
      await handler.handle(envelope('EtapaDaSagaFalhou', undefined, { etapa: 'invalida' }))
    ).toBe('business-error');
  });

  it('re-reads after losing compare-and-swap and retries only while the event can still apply', async () => {
    execution = Execucao.restaurar({
      ...Execucao.criar('os-1').toProps(),
      status: ExecucaoStatus.EM_DIAGNOSTICO,
    });
    repo.save.mockResolvedValueOnce(false);
    expect(await handler.handle(envelope('PagamentoConfirmado'))).toBe('retryable');

    execution = Execucao.restaurar({ ...execution.toProps(), status: ExecucaoStatus.CANCELADA });
    repo.save.mockResolvedValueOnce(false);
    expect(await handler.handle(envelope('PagamentoConfirmado'))).toBe('ignore');
  });

  it('conditional transitions resolve payment/cancel/repair races without overwriting EM_REPARO', async () => {
    execution = Execucao.restaurar({
      ...Execucao.criar('os-1').toProps(),
      status: ExecucaoStatus.AGUARDANDO_REPARO,
    });
    const current = execution;
    const repairAggregate = Execucao.restaurar(current.toProps());
    repairAggregate.iniciarReparo();
    const cancelAggregate = Execucao.restaurar(current.toProps());
    cancelAggregate.cancelar();
    const repair = repo.save(repairAggregate, ExecucaoStatus.AGUARDANDO_REPARO);
    const cancel = repo.save(cancelAggregate, ExecucaoStatus.AGUARDANDO_REPARO);
    await Promise.all([repair, cancel]);
    expect([ExecucaoStatus.EM_REPARO, ExecucaoStatus.CANCELADA]).toContain(
      execution.toProps().status
    );
    if (execution.toProps().status === ExecucaoStatus.EM_REPARO) {
      expect(await repo.save(cancelAggregate, ExecucaoStatus.AGUARDANDO_REPARO)).toBe(false);
    }
  });
});
