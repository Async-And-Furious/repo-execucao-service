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
      findByOrdemServicoId: jest.fn((_id: string) => Promise.resolve(execution)),
      save: jest.fn(),
      transition: jest.fn((_id, from, to, at, fields) => {
        if (!execution || !from.includes(execution.toProps().status))
          return Promise.resolve({ execucao: execution, changed: false });
        execution = Execucao.restaurar({
          ...execution.toProps(),
          status: to,
          updatedAt: at,
          ...fields,
        });
        return Promise.resolve({ execucao: execution, changed: true });
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

  it('conditional transitions resolve payment/cancel/repair races without overwriting EM_REPARO', async () => {
    execution = Execucao.restaurar({
      ...Execucao.criar('os-1').toProps(),
      status: ExecucaoStatus.AGUARDANDO_REPARO,
    });
    const repair = repo.transition(
      'id',
      [ExecucaoStatus.AGUARDANDO_REPARO],
      ExecucaoStatus.EM_REPARO,
      new Date()
    );
    const cancel = repo.transition(
      'id',
      [
        ExecucaoStatus.AGUARDANDO_DIAGNOSTICO,
        ExecucaoStatus.EM_DIAGNOSTICO,
        ExecucaoStatus.AGUARDANDO_REPARO,
      ],
      ExecucaoStatus.CANCELADA,
      new Date()
    );
    await Promise.all([repair, cancel]);
    expect([ExecucaoStatus.EM_REPARO, ExecucaoStatus.CANCELADA]).toContain(
      execution.toProps().status
    );
    if (execution.toProps().status === ExecucaoStatus.EM_REPARO) {
      expect(
        (
          await repo.transition(
            'id',
            [ExecucaoStatus.AGUARDANDO_REPARO],
            ExecucaoStatus.CANCELADA,
            new Date()
          )
        ).changed
      ).toBe(false);
    }
  });
});
